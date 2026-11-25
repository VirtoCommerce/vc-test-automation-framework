import { number, object, string } from "zod";

/** Who the designer's preview renders as: one of the store's `SiteBuilder.Store.PreviewUserIds`. */
export interface PreviewAuthCodeRequest {
  readonly storeId: string;
  readonly userId: string;
}

/** A one-time code the preview exchanges at the frontend's `/connect/token`; it lives `expiresInSeconds`. */
export const PREVIEW_AUTH_CODE = object({
  code: string().min(1),
  expiresInSeconds: number().int().positive(),
});
