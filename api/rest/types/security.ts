import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type ApplicationUserData = Rest.VirtoCommercePlatformCoreSecurityApplicationUser;
export type IdentityResult = Rest.MicrosoftAspNetCoreIdentityIdentityResult;
export type OAuthAppData = Rest.OpenIddictAbstractionsOpenIddictApplicationDescriptor;
export type OAuthAppSearchCriteria = Rest.VirtoCommercePlatformWebModelSecurityOAuthAppSearchCriteria;
export type OAuthAppSearchResult = Rest.VirtoCommercePlatformWebModelSecurityOAuthAppSearchResult;
export type Permission = Rest.VirtoCommercePlatformCoreSecurityPermission;
export type RoleData = Rest.VirtoCommercePlatformCoreSecurityRole;
export type RoleSearchCriteria = Rest.VirtoCommercePlatformCoreSecurityRoleSearchCriteria;
export type RoleSearchResult = Rest.VirtoCommercePlatformCoreSecuritySearchRoleSearchResult;
export type SecurityResult = Rest.VirtoCommercePlatformCoreSecuritySecurityResult;
export type UserApiKeyData = Rest.VirtoCommercePlatformCoreSecurityUserApiKey;
export type UserDetailData = Rest.VirtoCommercePlatformWebModelSecurityUserDetail;
export type UserSearchCriteria = Rest.VirtoCommercePlatformCoreSecurityUserSearchCriteria;
export type UserSearchResult = Rest.VirtoCommercePlatformCoreSecuritySearchUserSearchResult;

export const APPLICATION_USER = shape<ApplicationUserData>()("Application user", ["id", "userName", "email"]);
export type ApplicationUser = Shaped<typeof APPLICATION_USER>;
export const ROLE = shape<RoleData>()("Role", ["id", "name"]);
export type Role = Shaped<typeof ROLE>;
export const USER_API_KEY = shape<UserApiKeyData>()("User api key", ["id", "userId", "isActive"]);
export type UserApiKey = Shaped<typeof USER_API_KEY>;
export const OAUTH_APP = shape<OAuthAppData>()("OAuth app", ["clientId"]);
export type OAuthApp = Shaped<typeof OAUTH_APP>;
export const USER_DETAIL = shape<UserDetailData>()("User detail", ["id", "userName"]);
export type UserDetail = Shaped<typeof USER_DETAIL>;

export type {
  MicrosoftAspNetCoreIdentitySignInResult as SignInResultData,
  VirtoCommercePlatformWebModelSecurityLoginRequest as LoginRequestData,
} from "../generated/rest-api";
