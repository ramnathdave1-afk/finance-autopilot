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
