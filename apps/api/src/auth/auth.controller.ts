import { Body, Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { adminResetPasswordSchema, changePasswordSchema, signInSchema, signUpSchema } from "./auth.schemas";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("signup")
  async signUp(@Body() body: unknown) {
    const input = signUpSchema.parse(body);
    return this.authService.signUp(input);
  }

  @Post("signin")
  async signIn(@Body() body: unknown) {
    const input = signInSchema.parse(body);
    return this.authService.signIn(input);
  }

  @Post("change-password")
  async changePassword(@Body() body: unknown) {
    const input = changePasswordSchema.parse(body);
    return this.authService.changePassword(input);
  }

  @Post("admin/reset-password")
  async adminResetPassword(@Body() body: unknown) {
    const input = adminResetPasswordSchema.parse(body);
    return this.authService.adminResetPassword(input);
  }
}
