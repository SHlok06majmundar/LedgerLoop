import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE = 'responseMessage';

/** Sets the human-readable `message` of a successful response envelope. */
export const ResponseMessage = (message: string) => SetMetadata(RESPONSE_MESSAGE, message);
