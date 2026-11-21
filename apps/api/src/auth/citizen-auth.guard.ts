import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AUTH_PROVIDER, type AuthenticatedCitizen, type AuthProvider, type RequestHeaders } from "./auth-provider";

interface AuthRequest {
  headers: RequestHeaders;
  method?: string;
  citizenAuth?: AuthenticatedCitizen | null;
}

/** Protected route: an authenticated citizen is required (401 otherwise). */
@Injectable()
export class CitizenAuthGuard implements CanActivate {
  constructor(@Inject(AUTH_PROVIDER) private readonly auth: AuthProvider) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    req.citizenAuth = this.auth.authenticate(req);
    if (!req.citizenAuth) throw new UnauthorizedException("Authentication required");
    return true;
  }
}

/** Route that also serves anonymous users: attaches the citizen when authenticated, else null. */
@Injectable()
export class OptionalCitizenAuthGuard implements CanActivate {
  constructor(@Inject(AUTH_PROVIDER) private readonly auth: AuthProvider) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    req.citizenAuth = this.auth.authenticate(req);
    return true;
  }
}

/** The citizen resolved by CitizenAuthGuard / OptionalCitizenAuthGuard (null when anonymous). */
export const CurrentCitizen = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedCitizen | null =>
    ctx.switchToHttp().getRequest<AuthRequest>().citizenAuth ?? null,
);
