// --- Utility Types ---

export type Nullable<T> = T | null;
export type WithId<T> = T & { id: number };
export type DeepPartial<T> = { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] };
