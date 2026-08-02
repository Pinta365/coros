/**
 * STS-decoded bucket credentials for S3/OSS upload.
 */
export interface BucketCredentials {
    AccessKeyId: string;
    SecretAccessKey: string;
    SessionToken: string;
    Expiration: string;
    TokenExpireTime?: number;
    Region: string;
    Bucket: string;
    SessionName?: string;
    AccessKeySecret?: string;
}

/**
 * Single import job item from getImportSportList.
 */
export interface ImportJobItem {
    createTime: string;
    errorSize?: number;
    fileUrl: string;
    finishSize: number;
    id: string;
    idString: string;
    md5: string;
    originalFilename: string;
    size: number;
    source: number;
    status: number;
    taskImportPredicateSeconds?: number;
    taskImportRemainSeconds?: number;
    timezone: number;
    unzipPredicateSeconds?: number;
    updateTime: string;
    userId: string;
}

/**
 * Activity upload response data from activity/fit/import.
 */
export interface ActivityUploadData {
    createTime: string;
    errorSize?: number;
    fileUrl: string;
    finishSize: number;
    id: string;
    idString: string;
    md5: string;
    originalFilename: string;
    size: number;
    source: number;
    status: number;
    taskImportPredicateSeconds?: number;
    taskImportRemainSeconds?: number;
    timezone: number;
    unzipPredicateSeconds?: number;
    updateTime: string;
    userId: string;
}
