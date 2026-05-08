import { Module } from '@nestjs/common';
import { TurnkeyService } from './turnkey.service';

@Module({ providers: [TurnkeyService], exports: [TurnkeyService] })
export class TurnkeyModule {}
