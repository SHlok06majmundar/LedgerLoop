import type { Schema } from 'mongoose';

/** Serializes documents with `id` strings instead of `_id`/`__v`. */
export function jsonPlugin(schema: Schema): void {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret._id;
      return ret;
    },
  });
}
