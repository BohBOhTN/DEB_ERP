export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly fieldErrors?: Record<string, string>;

  public constructor(params: {
    statusCode: number;
    code: string;
    message: string;
    fieldErrors?: Record<string, string>;
  }) {
    super(params.message);
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.fieldErrors = params.fieldErrors;
  }
}
