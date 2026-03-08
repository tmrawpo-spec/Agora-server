import { Language } from "./i18n";
import { FakeProfile } from "@/contexts/DataContext";
import { Gender } from "@/contexts/AuthContext";

function makeId() {
  return "fake_" + Math.random().toString(36).substr(2, 9);
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const maleNames = [
  "SilverMoon", "NightWolf", "StarBlazer", "DarkNova", "LunarKnight",
  "MidnightRider", "CosmicDrift", "EchoVoid", "NeonStar", "VoidWalker",
  "AzurePhoenix", "GlacierPeak", "ThunderBolt", "ShadowFox", "CrystalEdge",
];

const femaleNames = [
  "MoonRiver", "StarDust", "LunarVibes", "NightBloom", "CosmicRose",
  "AuroraLight", "CelestialDawn", "VelvetNight", "SilkMoon", "MysticStar",
  "PearlDusk", "NebulaDream", "SapphireGlow", "AmberNight", "CrimsonWave",
];

const cityEn = ["Seoul", "Tokyo", "New York", "London", "Paris", "Sydney", "Toronto", "Berlin"];
const cityKo = ["서울", "부산", "인천", "대구", "광주"];
const cityJa = ["東京", "大阪", "京都", "名古屋", "横浜"];
const cityEs = ["Madrid", "Barcelona", "Buenos Aires", "México DF", "Bogotá"];

function getCities(lang: Language): string[] {
  switch (lang) {
    case "ko": return cityKo;
    case "ja": return cityJa;
    case "es": return cityEs;
    default: return cityEn;
  }
}

function getAge(): number {
  return Math.floor(Math.random() * 15) + 19;
}

function getDistanceKm(): number {
  return Math.floor(Math.random() * 490) + 10;
}

export function generateFakeProfiles(
  oppositeGender: Gender,
  language: Language,
  count = 20
): FakeProfile[] {
  const names = oppositeGender === "male" ? maleNames : femaleNames;
  const cities = getCities(language);

  return Array.from({ length: count }, () => ({
    id: makeId(),
    nickname: randomItem(names),
    gender: oppositeGender,
    age: getAge(),
    language,
    location: randomItem(cities),
    distanceKm: getDistanceKm(),
    isOnline: Math.random() > 0.4,
    profilePhoto: undefined,
  }));
}

export function generateMatchedProfile(
  oppositeGender: Gender,
  language: Language
): FakeProfile {
  const names = oppositeGender === "male" ? maleNames : femaleNames;
  const cities = getCities(language);

  return {
    id: makeId(),
    nickname: randomItem(names),
    gender: oppositeGender,
    age: getAge(),
    language,
    location: randomItem(cities),
    distanceKm: getDistanceKm(),
    isOnline: true,
  };
}
