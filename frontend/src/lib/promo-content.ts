export type PromoVideo = {
  id: string;
  slotLabel: string;
  platformLabel: string;
  title: string;
  description: string;
  videoUrl: string;
  cover: string;
  tags: string[];
};

export type PlaybackSource =
  | { kind: 'iframe'; src: string }
  | { kind: 'video'; src: string };

export const SITE_COPY = {
  heroEyebrow: 'DATA.ZMWSRANK.TOP VIDEO PROMO',
  heroTitle: '把造梦无双的热血、成长和镜头感，直接剪进 data.zmwsrank.top 的首页。',
  heroDescription:
    '这版首页不再像传统工具站那样冷启动，而是先用视频抓住眼球，再把内容、气质和数据能力一起讲清楚，让访客在第一屏就记住这个站。',
  playerTitle: '首屏主片位',
  playerDescription:
    '主播放器承接最核心的视频内容，下面的片单点一下就切换，适合做活动宣传、版本预热和精品视频聚合。',
  pillarTitle: '为什么这张首页更像宣传站',
  pillarDescription:
    '它不是把旧内容堆上来，而是把视频、品牌感和数据主题重新编排成更像作品集的观感。',
  playlistTitle: '精选片单',
  playlistDescription:
    '当前先放三支可直接播放的公开视频，后续替换成本地 MP4、B 站链接或新的 YouTube 片单都不需要改页面结构。',
  storyTitle: '这张宣传页在讲什么',
  storyDescription:
    '它不只是展示视频，更是在给 data.zmwsrank.top 定一个更鲜明的内容入口，让工具站也有内容站的第一印象。',
  footerNote: 'data.zmwsrank.top · 造梦无双视频宣传页 · 当前版本已支持可切换主片位与响应式浏览。',
} as const;

export const PROMO_VIDEOS: PromoVideo[] = [
  {
    id: 'closed-beta-fullrun',
    slotLabel: '精选片位 01',
    platformLabel: 'YouTube',
    title: '造梦无双封测全流程通关',
    description: '用完整流程回放拉出经典回归感，适合作为首页第一支主打内容。',
    videoUrl: 'https://www.youtube.com/watch?v=c7okXs1EfEM',
    cover: 'https://i.ytimg.com/vi/c7okXs1EfEM/hqdefault.jpg',
    tags: ['封测流程', '完整实录', '经典回归'],
  },
  {
    id: 'zero-start-challenge',
    slotLabel: '精选片位 02',
    platformLabel: 'YouTube',
    title: '从零开局的暴力通关挑战',
    description: '强调成长路线和战斗节奏，适合配合数据站的养成与路线内容。',
    videoUrl: 'https://www.youtube.com/watch?v=zZxDiWdWuoI',
    cover: 'https://i.ytimg.com/vi/zZxDiWdWuoI/hqdefault.jpg',
    tags: ['从零开局', '成长挑战', '高能节奏'],
  },
  {
    id: 'ice-phoenix-target',
    slotLabel: '精选片位 03',
    platformLabel: 'YouTube',
    title: '拿下冰晶凤凰的爆肝推进',
    description: '更偏中后段推进和目标导向，适合补足首页片单的层次和热度。',
    videoUrl: 'https://www.youtube.com/watch?v=o8qmt_bHeKU',
    cover: 'https://i.ytimg.com/vi/o8qmt_bHeKU/hqdefault.jpg',
    tags: ['目标推进', '角色养成', '战斗展示'],
  },
];

const YOUTUBE_WATCH_PARAM = 'v';
const BILIBILI_BVID_PREFIX = 'BV';
const BILIBILI_AV_PREFIX = 'av';

function extractYoutubeVideoId(url: URL): string {
  if (url.hostname.includes('youtu.be')) {
    return url.pathname.replace(/^\//, '').trim();
  }

  return url.searchParams.get(YOUTUBE_WATCH_PARAM)?.trim() ?? '';
}

function extractBilibiliVideoPath(url: URL): string {
  const segments = url.pathname.split('/').filter(Boolean);
  const videoToken = segments.find((segment) => segment.startsWith(BILIBILI_BVID_PREFIX) || segment.startsWith(BILIBILI_AV_PREFIX));

  return videoToken ?? '';
}

export function resolvePromoPlaybackSource(videoUrl: string): PlaybackSource | null {
  const normalizedVideoUrl = videoUrl.trim();

  if (!normalizedVideoUrl) {
    return null;
  }

  if (normalizedVideoUrl.startsWith('/')) {
    return { kind: 'video', src: normalizedVideoUrl };
  }

  const parsedUrl = new URL(normalizedVideoUrl);

  if (parsedUrl.hostname.includes('youtube.com') || parsedUrl.hostname.includes('youtu.be')) {
    const youtubeVideoId = extractYoutubeVideoId(parsedUrl);

    if (!youtubeVideoId) {
      throw new Error(`Unsupported promo video url: ${videoUrl}`);
    }

    return {
      kind: 'iframe',
      src: `https://www.youtube.com/embed/${youtubeVideoId}`,
    };
  }

  if (parsedUrl.hostname.includes('bilibili.com') || parsedUrl.hostname.includes('b23.tv')) {
    const bilibiliVideoPath = extractBilibiliVideoPath(parsedUrl);

    if (bilibiliVideoPath.startsWith(BILIBILI_BVID_PREFIX)) {
      return {
        kind: 'iframe',
        src: `https://player.bilibili.com/player.html?bvid=${bilibiliVideoPath}&autoplay=0`,
      };
    }

    if (bilibiliVideoPath.startsWith(BILIBILI_AV_PREFIX)) {
      return {
        kind: 'iframe',
        src: `https://player.bilibili.com/player.html?aid=${bilibiliVideoPath.slice(BILIBILI_AV_PREFIX.length)}&autoplay=0`,
      };
    }
  }

  throw new Error(`Unsupported promo video url: ${videoUrl}`);
}
