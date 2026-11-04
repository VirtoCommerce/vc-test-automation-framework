import type { HttpClient } from "../../http/http-client";
import type {
  Coupon,
  CouponData,
  CouponSearchCriteria,
  Promotion,
  PromotionData,
  PromotionSearchCriteria,
} from "../types/marketing";

import { requireFields } from "@core/required-fields";

import { COUPON, PROMOTION } from "../types/marketing";

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
    return requireFields(await this.find(id), COUPON.fields, `Coupon "${id}"`);
  }

  async find(id: string): Promise<Coupon | undefined> {
    const response = await this.#httpClient.get(`${COUPONS_PATH}/${encodeURIComponent(id)}`);
    return response.optionalRecord(COUPON);
  }

  async getByCode(promotionId: string, code: string): Promise<Coupon> {
    const found = (await this.search({ promotionId, code })).find((coupon) => coupon.code === code);
    return requireFields(found, COUPON.fields, `Coupon ${code} of promotion "${promotionId}"`);
  }

  async search(criteria: CouponSearchCriteria): Promise<Coupon[]> {
    const response = await this.#httpClient.post(`${COUPONS_PATH}/search`, { json: criteria });
    return response.results(COUPON);
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
    return requireFields(await this.find(id), PROMOTION.fields, `Promotion "${id}"`);
  }

  /** Finds a promotion; `undefined` when missing (the platform answers 404, not 200 with `null`). */
  async find(id: string): Promise<Promotion | undefined> {
    const response = await this.#httpClient.get(`${PROMOTIONS_PATH}/${encodeURIComponent(id)}`);
    return response.optionalRecord(PROMOTION, { allow404: true });
  }

  async template(): Promise<PromotionData> {
    return (await this.#httpClient.get(`${PROMOTIONS_PATH}/new`)).json<PromotionData>();
  }

  async create(promotion: PromotionData): Promise<Promotion> {
    const response = await this.#httpClient.post(PROMOTIONS_PATH, { json: promotion });
    return response.record(PROMOTION);
  }

  async update(promotion: PromotionData): Promise<void> {
    (await this.#httpClient.put(PROMOTIONS_PATH, { json: promotion })).expectOk();
  }

  async search(criteria: PromotionSearchCriteria): Promise<Promotion[]> {
    const response = await this.#httpClient.post(`${PROMOTIONS_PATH}/search`, { json: criteria });
    return response.results(PROMOTION);
  }

  async delete(ids: readonly string[]): Promise<void> {
    (await this.#httpClient.delete(PROMOTIONS_PATH, { query: { ids } })).expectOk();
  }
}
