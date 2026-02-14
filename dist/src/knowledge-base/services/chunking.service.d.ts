import { KBFileData, Chunk } from '../interfaces/knowledge-base.interface';
export declare class ChunkingService {
    chunkByObject(kbFile: KBFileData, arrayPath: string): Chunk[];
    chunkBySection(kbFile: KBFileData, sections: string[]): Chunk[];
    chunkByRule(kbFile: KBFileData, rulesPath: string): Chunk[];
    autoChunk(kbFile: KBFileData): Chunk[];
    private getNestedValue;
    private detectType;
    private extractKeywords;
    private extractWordsFromText;
    private extractChineseWords;
    private extractAllStrings;
    private isStopWord;
    private extractTextContent;
}
