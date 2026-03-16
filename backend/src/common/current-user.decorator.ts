import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  if (ctx.getType<string>() === 'ws') {
    return ctx.switchToWs().getClient().handshake.user;
  }
  return ctx.switchToHttp().getRequest().user;
});
