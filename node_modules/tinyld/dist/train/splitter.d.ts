export interface FreqWord {
    word: string;
    count: number;
}
export declare function processSentencesLineByLine(fileIn: string): Promise<FreqWord[]>;
export declare function processFrequencyLineByLine(fileIn: string): Promise<FreqWord[]>;
