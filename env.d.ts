declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DB: D1Database;
      BUCKET: R2Bucket;
      OPENROUTER_API_KEY: string;
      R2_ACCESS_KEY_ID: string;
      R2_SECRET_ACCESS_KEY: string;
      CF_ACCOUNT_ID: string;
      R2_BUCKET_NAME: string;
    }
  }
}

export {};
