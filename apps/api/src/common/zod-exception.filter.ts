import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter } from "@nestjs/common";
import { ZodError } from "zod";

@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(exception: ZodError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    const message = exception.issues[0]
      ? `${exception.issues[0].path.join(".") || "request"}: ${exception.issues[0].message}`
      : "Invalid request data.";

    response.status(400).json(new BadRequestException(message).getResponse());
  }
}
