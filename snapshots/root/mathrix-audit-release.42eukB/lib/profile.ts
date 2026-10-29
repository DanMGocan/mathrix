import { z } from "zod";

export const avatars = Array.from(
  { length: 24 },
  (_, i) => `robot-${String(i + 1).padStart(2, "0")}`,
);
export const avatarURL = (id = "robot-01") =>
  `/avatars/${avatars.includes(id) ? id : "robot-01"}.svg`;
export const countryCodes =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  );
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
export const countryName = (code: string) =>
  countryCodes.includes(code) ? regionNames.of(code) || code : "";
export const countryFlag = (code: string) =>
  countryCodes.includes(code)
    ? String.fromCodePoint(...[...code].map((c) => c.charCodeAt(0) + 127397))
    : "";
export const countries = countryCodes
  .map((code) => ({ code, name: countryName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name, "en"));
export const usernameSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9_-]{3,24}$/,
    "Use 3–24 letters, numbers, underscores or hyphens.",
  );
export const profileSchema = z
  .object({
    username: usernameSchema,
    city: z
      .string()
      .trim()
      .max(80)
      .refine((s) => !/[\p{Cc}\p{Cf}]/u.test(s), "Enter a valid city."),
    countryCode: z
      .string()
      .refine(
        (s) => s === "" || countryCodes.includes(s),
        "Choose a country from the list.",
      ),
    avatarId: z
      .string()
      .refine((s) => avatars.includes(s), "Choose an avatar from the gallery."),
  })
  .strict();
export type ProfileInput = z.infer<typeof profileSchema>;
export type PlayerAppearance = {
  avatarId?: string;
  city?: string;
  countryCode?: string;
  premium?: boolean;
};
export const mathematicians = [
  "Noether",
  "Euler",
  "Gauss",
  "Ramanujan",
  "Hypatia",
  "Turing",
  "Fibonacci",
  "Pascal",
  "Lovelace",
  "Hilbert",
  "Kovalevskaya",
  "Pythagoras",
];
