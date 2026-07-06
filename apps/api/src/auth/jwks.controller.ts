import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TokenService } from '../token/token.service';

@ApiTags('JWKS')
@Controller('.well-known')
export class JwksController {
  constructor(private tokenService: TokenService) {}

  @Get('jwks.json')
  @ApiOperation({ summary: 'JSON Web Key Set endpoint for token verification' })
  getJwks() {
    const jwk = this.tokenService.getPublicJwk();
    if (!jwk) {
      return { keys: [] };
    }

    return {
      keys: [{ ...jwk }],
    };
  }
}
