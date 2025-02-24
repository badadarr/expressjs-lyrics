import { DetectOption, ILangProfiles } from './core';
export declare function chunkTokenizer(text: string): string[];
export declare function wordTokenizer(text: string): string[];
export declare function ngramTokenizer(text: string, length: number, padding?: boolean): string[];
export declare function detectUniqueGrams(text: string, profiles: ILangProfiles, keys: Set<string>, options: DetectOption): string;
export declare function detectPotentialGrams(text: string, profiles: ILangProfiles, options: DetectOption): string;
export declare function detectStatsGrams(text: string, profiles: ILangProfiles, options: DetectOption): {
    lang: string;
    accuracy: number;
}[];
export declare function detectAllStats(text: string, options: DetectOption, profiles: ILangProfiles, uniqueKeys: Set<string>): {
    lang: string;
    accuracy: number;
}[];
