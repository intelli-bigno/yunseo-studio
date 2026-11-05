// CSV 가져오기 시험용 입력. 열 제목은 근거에 따라 둘로 나뉜다:
//  - OFFICIAL_*: 공식 문서의 지표 이름으로 만든 파일(근거 있음)
//  - GUESSED_*: 사람이 읽는 제목을 추정해 만든 파일 — Business Suite·YouTube Studio 가 실제로 내보내는 열 제목은 공개 문서에서 확인하지 못했다.
// 내용은 전부 가짜 값이다(실제 계정 데이터 아님).

export const OFFICIAL_INSTAGRAM_CSV = [
  "permalink,views,reach,likes,comments,saved,shares,profile_visits,follows,total_interactions",
  "https://www.instagram.com/p/AAA111/?utm_source=ig_web_copy_link,1200,900,80,6,45,12,60,9,143",
  "https://www.instagram.com/p/BBB222/,800,610,40,2,15,5,30,3,62",
  "https://www.instagram.com/p/ZZZ999/,10,10,1,0,0,0,0,0,1",
].join("\n");

export const GUESSED_INSTAGRAM_CSV = [
  "\uFEFF게시물 링크;제목;게시일;조회수;도달;좋아요;댓글;저장;공유;프로필 방문;팔로우",
  '"https://instagram.com/p/AAA111";"다음 사건의 변수, 정리";2026-11-04;"1,200";900;80;6;45;12;60;9',
  '"";"두 번째 편";2026.11.5.;-;610;40;;15;5;30;3',
].join("\r\n");

export const OFFICIAL_YOUTUBE_CSV = [
  "video,views,engagedViews,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained,subscribersLost",
  "V-1,5000,4200,1500.5,0:18,72.5,300,20,41,25,2",
  "V-2,100,90,12,0:07,40,3,0,0,0,0",
].join("\n");

export const GUESSED_YOUTUBE_CSV = [
  "Content,Video title,Video publish time,Views,Watch time (hours),Average view duration,Subscribers,Impressions,Impressions click-through rate (%)",
  "abc123,다음 사건의 변수 (Shorts),2026-11-04,\"5,000\",25.5,0:00:18,25,\"20,000\",4.2",
  "def456,알 수 없는 영상,2026-11-04,10,0.1,0:05,0,300,1.1",
].join("\n");
