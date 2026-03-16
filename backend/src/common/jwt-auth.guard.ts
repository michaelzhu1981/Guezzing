import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(err: unknown, user: TUser) {
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }

  getRequest(context: ExecutionContext) {
    if (context.getType<string>() === 'ws') {
      return context.switchToWs().getClient().handshake;
    }
    return context.switchToHttp().getRequest();
  }
}
