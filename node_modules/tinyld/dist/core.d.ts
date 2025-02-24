export interface ILangProfiles {
    uniques: {
        [id: string]: string;
    };
    multiples: {
        [gram: string]: {
            [country: string]: number;
        };
    };
}
export interface ILangCompressedProfiles {
    uniques: {
        [id: string]: string | number;
    };
    multiples: {
        [gram: string]: string;
    };
}
export declare const configSet: "normal" | "heavy" | "light";
export declare const TRAINING_UNIQUE_GRAMS: number[];
export declare const TOP_LANGUAGE_UNIQUE_GRAMS: number;
export declare const TOP_LANGUAGE_STATS_GRAMS: number;
export declare function approximate(value: number): number;
export declare function isSkipProba(country: string): boolean;
export declare function getCoef(country: string): number;
export declare function getLangTopStatsGram(country: string): number;
export declare const parseDetectOption: (options?: Partial<DetectOption>) => DetectOption;
export interface DetectOption {
    only: string[];
    verbose: boolean;
}
export declare const langs: Set<string>;
export declare const supportedLanguages: string[];
export declare const langToId: {
    [k: string]: number;
};
export declare const langFromId: {
    [k: string]: string;
};
export declare function langRegion(iso3: string): string;
export declare function langName(iso3: string): string;
export declare function validateISO2(iso2: string): string;
export declare function toISO2(iso3: string): string;
export declare function toISO3(iso2: string): string;
