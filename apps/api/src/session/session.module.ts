import { Module } from '@nestjs/common';
import { SessionVerifierService } from './session-verifier.service';

@Module({
  providers: [SessionVerifierService],
  exports: [SessionVerifierService],
})
export class SessionModule {}
