import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Skips access-token authentication for a route. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
