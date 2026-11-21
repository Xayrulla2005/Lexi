import { Global, Logger, Module } from "@nestjs/common";
import { OneIdSimulatorAuthProvider } from "../sim/oneid.auth-provider";
import { OneIdSimulatorService } from "../sim/oneid.service";
import { SimModule } from "../sim/sim.module";
import { AUTH_PROVIDER, type AuthProvider, DenyAllAuthProvider } from "./auth-provider";
import { CitizenAuthGuard, OptionalCitizenAuthGuard } from "./citizen-auth.guard";
import { simModeEnabled, SimModeGuard } from "./sim-mode";

/**
 * Authentication for every module (global). The provider is chosen once at startup:
 * SIM_MODE=true -> OneID simulator (development only); otherwise deny-all, because no
 * production identity provider (real OneID) is integrated yet.
 */
@Global()
@Module({
  imports: [SimModule],
  providers: [
    {
      provide: AUTH_PROVIDER,
      inject: [OneIdSimulatorService],
      useFactory: (oneId: OneIdSimulatorService): AuthProvider => {
        const provider = simModeEnabled() ? new OneIdSimulatorAuthProvider(oneId) : new DenyAllAuthProvider();
        Logger.log(`auth provider: ${provider.id}${provider.simulated ? " (SIMULATOR, not production)" : ""}`, "Auth");
        return provider;
      },
    },
    CitizenAuthGuard,
    OptionalCitizenAuthGuard,
    SimModeGuard,
  ],
  exports: [AUTH_PROVIDER, CitizenAuthGuard, OptionalCitizenAuthGuard, SimModeGuard],
})
export class AuthModule {}
