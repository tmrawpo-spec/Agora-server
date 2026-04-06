const { setGlobalOptions } = require("firebase-functions/v2/options");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const {
  getFirestore,
  FieldValue,
  Timestamp,
} = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();

setGlobalOptions({ maxInstances: 10 });

const revenueCatWebhookAuth = defineSecret("REVENUECAT_WEBHOOK_AUTH");

exports.helloWorld = onRequest((request, response) => {
  logger.info("Hello logs!", { structuredData: true });
  response.send("Hello from Firebase!");
});

function toTimestampOrNull(ms) {
  return typeof ms === "number" && Number.isFinite(ms)
    ? Timestamp.fromMillis(ms)
    : null;
}

function uniqueStrings(values) {
  return [...new Set(values.filter((v) => typeof v === "string" && v.trim() !== ""))];
}

function getCandidateUserIds(event) {
  return uniqueStrings([
    event.app_user_id,
    event.original_app_user_id,
    ...(Array.isArray(event.aliases) ? event.aliases : []),
  ]);
}

function pickFirebaseUid(event) {
  const candidates = getCandidateUserIds(event);

  const nonAnonymous = candidates.find((id) => !id.startsWith("$RCAnonymousID:"));
  return nonAnonymous || null;
}

function computeSubscriptionState(event) {
  const type = event.type || null;
  const now = Date.now();

  const expirationAtMs =
    typeof event.expiration_at_ms === "number" && Number.isFinite(event.expiration_at_ms)
      ? event.expiration_at_ms
      : null;

  const gracePeriodExpirationAtMs =
    typeof event.grace_period_expiration_at_ms === "number" &&
    Number.isFinite(event.grace_period_expiration_at_ms)
      ? event.grace_period_expiration_at_ms
      : null;

  const hasFutureExpiration =
    expirationAtMs !== null && expirationAtMs > now;

  const hasFutureGracePeriod =
    gracePeriodExpirationAtMs !== null && gracePeriodExpirationAtMs > now;

  let subscriptionStatus = "unknown";
  let isPremium = false;

  switch (type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "SUBSCRIPTION_EXTENDED":
    case "TEMPORARY_ENTITLEMENT_GRANT":
      subscriptionStatus = "active";
      isPremium = hasFutureExpiration || type === "TEMPORARY_ENTITLEMENT_GRANT";
      break;

    case "CANCELLATION":
      subscriptionStatus = "canceled";
      isPremium = hasFutureExpiration;
      break;

    case "BILLING_ISSUE":
      subscriptionStatus = "billing_issue";
      isPremium = hasFutureGracePeriod || hasFutureExpiration;
      break;

    case "SUBSCRIPTION_PAUSED":
      subscriptionStatus = "paused";
      isPremium = hasFutureExpiration;
      break;

    case "PRODUCT_CHANGE":
      subscriptionStatus = "product_changed";
      isPremium = hasFutureExpiration;
      break;

    case "NON_RENEWING_PURCHASE":
      subscriptionStatus = "non_renewing_purchase";
      isPremium = hasFutureExpiration;
      break;

    case "EXPIRATION":
      subscriptionStatus = "expired";
      isPremium = false;
      break;

    case "TRANSFER":
      subscriptionStatus = "transferred";
      isPremium = hasFutureExpiration;
      break;

    case "TEST":
      subscriptionStatus = "test";
      isPremium = false;
      break;

    default:
      subscriptionStatus = String(type || "unknown").toLowerCase();
      isPremium = hasFutureExpiration;
      break;
  }

  return {
    subscriptionStatus,
    isPremium,
    expirationAtMs,
    gracePeriodExpirationAtMs,
  };
}

exports.revenueCatWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [revenueCatWebhookAuth],
  },
  async (request, response) => {
    try {
      if (request.method !== "POST") {
        response.status(405).send("Method Not Allowed");
        return;
      }

      const expectedAuth = revenueCatWebhookAuth.value();
      const receivedAuth = request.get("Authorization") || "";

      if (!expectedAuth || receivedAuth !== expectedAuth) {
        logger.warn("Unauthorized RevenueCat webhook request", {
          structuredData: true,
          hasAuthorizationHeader: !!receivedAuth,
        });
        response.status(401).send("Unauthorized");
        return;
      }

      const body = request.body || {};
      const event = body.event || {};

      const eventId = event.id || null;
      const eventType = event.type || null;
      const productId = event.product_id || null;
      const environment = event.environment || null;
      const store = event.store || null;

      logger.info("RevenueCat webhook received", {
        structuredData: true,
        eventId,
        eventType,
        productId,
        environment,
        store,
      });

      if (eventType === "TEST") {
        response.status(200).send("ok");
        return;
      }

      const firebaseUid = pickFirebaseUid(event);

      if (!firebaseUid) {
        logger.warn("RevenueCat webhook ignored: no Firebase uid found", {
          structuredData: true,
          eventId,
          eventType,
          appUserId: event.app_user_id || null,
          originalAppUserId: event.original_app_user_id || null,
          aliases: Array.isArray(event.aliases) ? event.aliases : [],
        });
        response.status(200).send("ok");
        return;
      }

      const {
        subscriptionStatus,
        isPremium,
        expirationAtMs,
        gracePeriodExpirationAtMs,
      } = computeSubscriptionState(event);

      const userRef = db.collection("users").doc(firebaseUid);

      await userRef.set(
        {
          isPremium,
          subscriptionStatus,
          productId,
          expiresAt: toTimestampOrNull(expirationAtMs),
          gracePeriodExpiresAt: toTimestampOrNull(gracePeriodExpirationAtMs),
          revenueCatAppUserId: event.app_user_id || null,
          revenueCatOriginalAppUserId: event.original_app_user_id || null,
          revenueCatAliases: Array.isArray(event.aliases) ? event.aliases : [],
          revenueCatEntitlementIds: Array.isArray(event.entitlement_ids)
            ? event.entitlement_ids
            : [],
          revenueCatEnvironment: environment,
          revenueCatStore: store,
          revenueCatPeriodType: event.period_type || null,
          revenueCatLastEventId: eventId,
          revenueCatLastEventType: eventType,
          revenueCatLastEventAt: typeof event.event_timestamp_ms === "number"
            ? Timestamp.fromMillis(event.event_timestamp_ms)
            : FieldValue.serverTimestamp(),
          lastRevenueCatEvent: {
            id: eventId,
            type: eventType,
            productId,
            environment,
            store,
            purchasedAtMs: event.purchased_at_ms || null,
            expirationAtMs,
            eventTimestampMs: event.event_timestamp_ms || null,
            cancelReason: event.cancel_reason || null,
            expirationReason: event.expiration_reason || null,
          },
          revenueCatUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      logger.info("RevenueCat user updated", {
        structuredData: true,
        firebaseUid,
        eventId,
        eventType,
        isPremium,
        subscriptionStatus,
        productId,
      });

      response.status(200).send("ok");
    } catch (error) {
      logger.error("RevenueCat webhook error", {
        structuredData: true,
        message: error?.message || String(error),
        stack: error?.stack || null,
      });
      response.status(500).send("Internal Server Error");
    }
  }
);