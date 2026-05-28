import type { MerchantCancelSpec } from './types';
import { netflix } from './netflix';
import { spotify } from './spotify';
import { nyt } from './nyt';
import { disneyPlus } from './disney-plus';
import { hboMax } from './hbo-max';
import { hulu } from './hulu';
import { planetFitness } from './planet-fitness';
import { equinox } from './equinox';
import { chatgptPlus } from './chatgpt-plus';
import { adobeCc } from './adobe-cc';
import { amazonPrime } from './amazon-prime';
import { youtubePremium } from './youtube-premium';
import { appleOne } from './apple-one';
import { paramountPlus } from './paramount-plus';
import { peacock } from './peacock';
import { audible } from './audible';
import { espnPlus } from './espn-plus';
import { crunchyroll } from './crunchyroll';
import { dropbox } from './dropbox';
import { googleOne } from './google-one';
import { icloud } from './icloud';
import { microsoft365 } from './microsoft-365';
import { notion } from './notion';
import { canva } from './canva';
import { grammarly } from './grammarly';
import { linkedinPremium } from './linkedin-premium';
import { scribd } from './scribd';
import { masterclass } from './masterclass';
import { chegg } from './chegg';
import { duolingoPlus } from './duolingo-plus';
import { nordvpn } from './nordvpn';
import { expressvpn } from './expressvpn';
import { dashpass } from './dashpass';
import { uberOne } from './uber-one';
import { instacartPlus } from './instacart-plus';
import { walmartPlus } from './walmart-plus';
import { blueApron } from './blue-apron';
import { hellofresh } from './hellofresh';
import { peloton } from './peloton';
import { classpass } from './classpass';
import { lifetimeFitness } from './lifetime-fitness';
import { twentyFourHourFitness } from './24-hour-fitness';
import { siriusXm } from './sirius-xm';
import { calm } from './calm';
import { headspace } from './headspace';
import { tinder } from './tinder';
import { bumble } from './bumble';
import { ring } from './ring';
import { life360 } from './life360';
import { twitchTurbo } from './twitch-turbo';

export type { MerchantCancelSpec, CancelStep, CancelAction } from './types';

const _all: MerchantCancelSpec[] = [
  netflix,
  spotify,
  nyt,
  disneyPlus,
  hboMax,
  hulu,
  planetFitness,
  equinox,
  chatgptPlus,
  adobeCc,
  amazonPrime,
  youtubePremium,
  appleOne,
  paramountPlus,
  peacock,
  audible,
  espnPlus,
  crunchyroll,
  dropbox,
  googleOne,
  icloud,
  microsoft365,
  notion,
  canva,
  grammarly,
  linkedinPremium,
  scribd,
  masterclass,
  chegg,
  duolingoPlus,
  nordvpn,
  expressvpn,
  dashpass,
  uberOne,
  instacartPlus,
  walmartPlus,
  blueApron,
  hellofresh,
  peloton,
  classpass,
  lifetimeFitness,
  twentyFourHourFitness,
  siriusXm,
  calm,
  headspace,
  tinder,
  bumble,
  ring,
  life360,
  twitchTurbo,
];

export const registry: Readonly<Record<string, MerchantCancelSpec>> = Object.freeze(
  _all.reduce<Record<string, MerchantCancelSpec>>((acc, spec) => {
    if (acc[spec.merchantKey]) {
      throw new Error(`duplicate merchantKey in registry: ${spec.merchantKey}`);
    }
    acc[spec.merchantKey] = spec;
    return acc;
  }, {}),
);

export function lookupMerchant(merchantKey: string): MerchantCancelSpec | undefined {
  return registry[merchantKey];
}

export const registryList: ReadonlyArray<MerchantCancelSpec> = Object.freeze(_all);
