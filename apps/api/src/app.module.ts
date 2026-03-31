import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { resolve } from "node:path";
import { HealthController } from "./health/health.controller";
import { validateEnv } from "./config/env";
import { PrismaService } from "./prisma/prisma.service";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { BusinessesController } from "./businesses/businesses.controller";
import { BusinessesService } from "./businesses/businesses.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")],
      validate: validateEnv,
    }),
  ],
  controllers: [HealthController, AuthController, BusinessesController],
  providers: [PrismaService, AuthService, BusinessesService],
})
export class AppModule {}
