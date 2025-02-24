type DetectMethod = (val: string) => Promise<string> | string;
export type BenchmarkResult = {
    size: Record<string, BenchmarkSize>;
    stats: {
        min: number;
        max: number;
        success_rate: number;
        error_rate: number;
        unindentified_rate: number;
        execution_time: number;
    };
    languages: Record<string, number>;
};
type BenchmarkSize = {
    success_rate: number;
    error_rate: number;
    unindentified_rate: number;
    execution_time: number;
};
export declare function benchmark(detect: DetectMethod): Promise<BenchmarkResult>;
export {};
