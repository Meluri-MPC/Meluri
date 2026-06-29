export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  profileTransform: (data: Record<string, any>) => OAuthProfile;
}

export interface OAuthProfile {
  providerUserId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  provider: string;
}

export function getProviderConfigs(redirectBase: string): Record<string, OAuthProviderConfig> {
  return {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirectUri: `${redirectBase}/oauth/callback/google`,
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
      scopes: ['openid', 'profile', 'email'],
      profileTransform: (data) => ({
        providerUserId: data.sub,
        email: data.email,
        name: data.name ?? data.email?.split('@')[0],
        avatarUrl: data.picture,
        provider: 'google',
      }),
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
      redirectUri: `${redirectBase}/oauth/callback/github`,
      authUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userInfoUrl: 'https://api.github.com/user',
      scopes: ['user:email'],
      profileTransform: (data) => ({
        providerUserId: String(data.id),
        email: data.email ?? `${data.login}@github.user`,
        name: data.name ?? data.login,
        avatarUrl: data.avatar_url,
        provider: 'github',
      }),
    },
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID ?? '',
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? '',
      redirectUri: `${redirectBase}/oauth/callback/discord`,
      authUrl: 'https://discord.com/api/oauth2/authorize',
      tokenUrl: 'https://discord.com/api/oauth2/token',
      userInfoUrl: 'https://discord.com/api/users/@me',
      scopes: ['identify', 'email'],
      profileTransform: (data) => ({
        providerUserId: data.id,
        email: data.email ?? `${data.username}@discord.user`,
        name: data.global_name ?? data.username,
        avatarUrl: data.avatar
          ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png`
          : undefined,
        provider: 'discord',
      }),
    },
    twitter: {
      clientId: process.env.TWITTER_CLIENT_ID ?? '',
      clientSecret: process.env.TWITTER_CLIENT_SECRET ?? '',
      redirectUri: `${redirectBase}/oauth/callback/twitter`,
      authUrl: 'https://twitter.com/i/oauth2/authorize',
      tokenUrl: 'https://api.twitter.com/2/oauth2/token',
      userInfoUrl: 'https://api.twitter.com/2/users/me?user.fields=profile_image_url',
      scopes: ['users.read', 'tweet.read'],
      profileTransform: (data) => {
        const userData = data.data ?? data;
        return {
          providerUserId: userData.id,
          email: `${userData.username}@twitter.user`,
          name: userData.name ?? userData.username,
          avatarUrl: userData.profile_image_url,
          provider: 'twitter',
        };
      },
    },
    apple: {
      clientId: process.env.APPLE_CLIENT_ID ?? '',
      clientSecret: process.env.APPLE_CLIENT_SECRET ?? '',
      redirectUri: `${redirectBase}/oauth/callback/apple`,
      authUrl: 'https://appleid.apple.com/auth/authorize',
      tokenUrl: 'https://appleid.apple.com/auth/token',
      userInfoUrl: 'https://appleid.apple.com/auth/token',
      scopes: ['name', 'email'],
      profileTransform: (data) => {
        const idToken = decodeAppleIdToken(data.id_token);
        return {
          providerUserId: idToken.sub,
          email: idToken.email ?? `${idToken.sub}@apple.user`,
          name: data.user?.name?.firstName
            ? `${data.user.name.firstName} ${data.user.name.lastName}`
            : `Apple User ${idToken.sub.slice(0, 8)}`,
          provider: 'apple',
        };
      },
    },
  };
}

function decodeAppleIdToken(token: string): Record<string, string> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return {};
    return JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
  } catch {
    return {};
  }
}
