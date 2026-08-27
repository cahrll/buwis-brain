const RRF_K = 60;

export interface FusedEntry {
  id: string;
  score: number;
  vectorRank: number | null;
  keywordRank: number | null;
}

export function fuseRrf(vectorIds: string[], keywordIds: string[]): FusedEntry[] {
  const map = new Map<string, FusedEntry>();
  const add = (ids: string[], leg: "vectorRank" | "keywordRank") => {
    ids.forEach((id, i) => {
      const rank = i + 1;
      const entry = map.get(id) ?? { id, score: 0, vectorRank: null, keywordRank: null };
      entry[leg] = rank;
      entry.score += 1 / (RRF_K + rank);
      map.set(id, entry);
    });
  };
  add(vectorIds, "vectorRank");
  add(keywordIds, "keywordRank");
  return [...map.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
