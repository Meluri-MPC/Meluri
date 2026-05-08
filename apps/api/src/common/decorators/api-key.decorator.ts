import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ApiKey = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest().apiKey;
});
