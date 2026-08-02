/**
 * @pinta365/coros — Unofficial TypeScript/JavaScript wrapper for the COROS Training Hub API.
 * Deno-first; works on Deno, Node 18+, Bun, and browser (read-only + optional upload).
 */

export { CorosClient } from "./src/client.ts";
export type { ActivityQueryOptions, ClientOptions } from "./src/client.ts";
export { ApiError, AuthError, HttpError } from "./src/errors.ts";
export { buildUrl } from "./src/http.ts";
export { formatYYYYMMDD } from "./src/date.ts";
export {
    dateFromDetailTimestamp,
    dateFromTimestamp,
    dateFromYYYYMMDD,
    DETAIL_SCALE,
    fromDetailScale,
    GPS_SCALE,
    gpsCoordinate,
    paceSecondsPerKm,
    timezoneOffsetMinutes,
    toApiTimezone,
    toKilocalories,
} from "./src/units.ts";
export {
    BASE_URL_BY_REGION,
    DEFAULT_BASE_URL,
    DEFAULT_UPLOAD_REGION,
    FAQ_API_URL,
    FILE_TYPE_API_VALUES,
    MAX_PAGE_SIZE,
    PERCEIVED_EXERTION_BY_VALUE,
    PERCEIVED_EXERTION_LABELS,
    perceivedExertionName,
    SPORT_TYPE_API_VALUES,
    SPORT_TYPE_BY_VALUE,
    sportTypeName,
    STS_CONFIG_BY_REGION,
} from "./src/constants.ts";
export type { ApiRegion, FileTypeKey, PerceivedExertionKey, SportTypeKey, STSConfig } from "./src/constants.ts";
export type {
    AccountResponse,
    ActivityDetailData,
    ActivityDetailSummary,
    ActivityDownloadData,
    ActivityFrequencyPoint,
    ActivityLapGroup,
    ActivityLapItem,
    ActivityListData,
    ActivityListItem,
    ActivitySportFeelInfo,
    ActivityUploadData,
    AnalyseData,
    AnalyseDay,
    AnalyseRecord,
    AnalyseSummaryInfo,
    AnalyseWeek,
    ApiResponse,
    ApiResponseBase,
    BucketCredentials,
    Credentials,
    DistributionBucket,
    ImportJobItem,
    LoginData,
    LoginResponse,
    PrivateProfileData,
    RecordPeriod,
    RecordSeries,
    TrainingProgram,
    TrainingScheduleData,
    TrainingWeekStage,
    TrainSum,
    User,
    ZoneBand,
} from "./src/types/index.ts";
export { isSuccessResponse, SUCCESS_RESULT } from "./src/types/index.ts";
