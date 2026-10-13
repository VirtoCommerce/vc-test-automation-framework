import type { HttpClient } from "../../http/http-client";
import type {
  Coupon,
  CouponData,
  CouponSearchCriteria,
  CouponSearchResult,
  Promotion,
  PromotionData,
  PromotionSearchCriteria,
  PromotionSearchResult,
} from "../types/marketing";

import { optionalFields, requireFields, requireFieldsOfEach } from "@core/required-fields";

import { COUPON_FIELDS, PROMOTION_FIELDS } from "../types/marketing";

const PROMOTIONS_PATH = "/api/marketing/promotions";
const COUPONS_PATH = `${PROMOTIONS_PATH}/coupons`;

class CouponsResource {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async saveMany(coupons: readonly CouponData[]): Promise<void> {
    (await this.#httpClient.post(`${COUPONS_PATH}/add`, { json: coupons })).expectOk();
  }

  async get(id: string): Promise<Coupon> {
    return requireFields(await this.find(id), COUPON_FIELDS, `Coupon "${id}"`);
  }

  async find(id: string): Promise<Coupon | undefined> {
    const response = await this.#httpClient.get(`${COUPONS_PATH}/${encodeURIComponent(id)}`);
    return optionalFields(response.optionalJson<CouponData>(), COUPON_FIELDS, `Coupon "${id}"`);
  }

  async getByCode(promotionId: string, code: string): Promise<Coupon> {
    const found = (await this.search({ promotionId, code })).find((coupon) => coupon.code === code);
    return requireFields(found, COUPON_FIELDS, `Coupon ${code} of promotion "${promotionId}"`);
  }

  async search(criteria: CouponSearchCriteria): Promise<Coupon[]> {
    const response = await this.#httpClient.post(`${COUPONS_PATH}/search`, { json: criteria });
    const { results } = response.json<CouponSearchResult>();
    return requireFieldsOfEach(results, COUPON_FIELDS, "Found coupon");
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(`${COUPONS_PATH}/delete`, { query: { ids } })).expectOk();
  }
}

export class PromotionsClient {
  readonly coupons: CouponsResource;
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
    this.coupons = new CouponsResource(httpClient);
  }

  async get(id: string): Promise<Promotion> {
    return requireFields(await this.find(id), PROMOTION_FIELDS, `Promotion "${id}"`);
  }

  /** Finds a promotion; `undefined` when missing (the platform answers 404, not 200 with `null`). */
  async find(id: string): Promise<Promotion | undefined> {
    const response = await this.#httpClient.get(`${PROMOTIONS_PATH}/${encodeURIComponent(id)}`);
    return optionalFields(
      response.optionalJson<PromotionData>({ allow404: true }),
      PROMOTION_FIELDS,
      `Promotion "${id}"`,
    );
  }

  async template(): Promise<PromotionData> {
    return (await this.#httpClient.get(`${PROMOTIONS_PATH}/new`)).json<PromotionData>();
  }

  async create(promotion: PromotionData): Promise<Promotion> {
    const response = await this.#httpClient.post(PROMOTIONS_PATH, { json: promotion });
    return requireFields(response.json<PromotionData>(), PROMOTION_FIELDS, "Created promotion");
  }

  async update(promotion: PromotionData): Promise<void> {
    (await this.#httpClient.put(PROMOTIONS_PATH, { json: promotion })).expectOk();
  }

  async search(criteria: PromotionSearchCriteria): Promise<Promotion[]> {
    const response = await this.#httpClient.post(`${PROMOTIONS_PATH}/search`, { json: criteria });
    const { results } = response.json<PromotionSearchResult>();
    return requireFieldsOfEach(results, PROMOTION_FIELDS, "Found promotion");
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(PROMOTIONS_PATH, { query: { ids } })).expectOk();
  }
}
