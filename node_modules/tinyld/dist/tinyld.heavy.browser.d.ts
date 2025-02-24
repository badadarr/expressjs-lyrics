import { DetectOption } from './core';
export declare function detect(text: string, opts?: Partial<DetectOption>): string;
export declare function detectAll(text: string, opts?: Partial<DetectOption>): {
    lang: string;
    accuracy: number;
}[];
export { cleanString } from './clean';
export { toISO2, toISO3, langName, langRegion, validateISO2, supportedLanguages } from './core';
