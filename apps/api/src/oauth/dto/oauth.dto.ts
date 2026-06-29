export class OAuthInitiateDto {
  provider: 'google' | 'github' | 'discord' | 'twitter' | 'apple';
  redirectUrl?: string;
}

export class OAuthCallbackDto {
  code: string;
  state: string;
  provider: string;
}

export class MagicLinkRequestDto {
  email: string;
  redirectUrl?: string;
}

export class MagicLinkVerifyDto {
  email: string;
  code: string;
}

export class SessionResponseDto {
  userId: string;
  sessionToken: string;
  expiresAt: string;
  provider: string;
  email: string;
  name: string;
  avatarUrl?: string;
}
