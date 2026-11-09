import { NextResponse } from 'next/server';
import { jobs } from '@/lib/jobs';
import { dbRow, getDb } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').slice(0, 120).toLowerCase();
  const location = (searchParams.get('location') || '').slice(0, 120).toLowerCase();
  const level = (searchParams.get('level') || '').slice(0, 40);
  const remote = searchParams.get('remote') === 'true';
  const salaryListed = searchParams.get('salaryListed') === 'true';
  const sort = searchParams.get('sort') === 'newest' ? 'newest' : 'match';
  const page = Math.min(1000, Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1));

  let list = jobs;
  let source = 'SponsorSignal sample';
  let hasMore = false;
  try {
    const upstream = new URL(q ? 'https://himalayas.app/jobs/api/search' : 'https://himalayas.app/jobs/api');
    if (q) upstream.searchParams.set('q', q);
    if (sort === 'newest') upstream.searchParams.set('sort', 'recent');
    else if (q) upstream.searchParams.set('sort', 'relevant');
    upstream.searchParams.set(q ? 'page' : 'limit', q ? String(page) : '20');
    if (!q) upstream.searchParams.set('offset', String((page - 1) * 20));
    const response = await fetch(upstream, {
      next: { revalidate: 21600 },
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      const feed = await response.json() as { totalCount?: number; jobs?: Array<{guid?:string;applicationLink?:string;title?:string;companyName?:string;locationRestrictions?:string[];seniority?:string[];minSalary?:number|null;maxSalary?:number|null;currency?:string|null;salaryPeriod?:string;categories?:string[];parentCategories?:string[];pubDate?:number}> };
      const live = (feed.jobs || []).flatMap(job => {
        const url = job.applicationLink || job.guid;
        if (!url || !job.title || !job.companyName) return [];
        const salary = job.minSalary && job.maxSalary ? `${job.currency || 'USD'} ${job.minSalary.toLocaleString()}–${job.maxSalary.toLocaleString()}` : 'Salary not listed';
        const level = job.seniority?.includes('Entry-level') ? 'Entry' : job.seniority?.some(value => ['Senior', 'Manager', 'Director', 'Executive'].includes(value)) ? 'Senior' : job.seniority?.includes('Mid-level') ? 'Mid-Senior' : 'Mid';
        return [{ id: `himalayas-${encodeURIComponent(job.guid || url)}`, company: job.companyName, role: job.title, location: job.locationRestrictions?.join(', ') || 'Remote', level, salary, match: 0, tags: (job.categories || job.parentCategories || []).slice(0, 3), logo: job.companyName.slice(0, 1).toUpperCase(), verified: false, posted: job.pubDate ? new Date(job.pubDate * 1000).toLocaleDateString() : 'Recently', url, source: 'Himalayas' }];
      });
      if (live.length) {
        list = live;
        source = 'Himalayas';
        hasMore = typeof feed.totalCount === 'number' && page * 20 < feed.totalCount;
        const db = await getDb();
        await db.batch(live.map(job => ({
          sql: `INSERT INTO jobs (id, company, role, location, level, salary, match_score, tags_json, logo, verified, posted, url, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET company=excluded.company, role=excluded.role, location=excluded.location,
            level=excluded.level, salary=excluded.salary, tags_json=excluded.tags_json, logo=excluded.logo,
            posted=excluded.posted, url=excluded.url, source=excluded.source`,
          args: [job.id, job.company, job.role, job.location, job.level, job.salary, job.match, JSON.stringify(job.tags), job.logo, job.verified ? 1 : 0, job.posted, job.url, job.source ?? null],
        })), 'write');
      }
    }
  } catch {
    // Continue serving the bundled sample roles if the upstream feed is unavailable.
  }
  if (source !== 'Himalayas') {
    const db = await getDb();
    const result = await db.execute({ sql: `SELECT * FROM jobs ORDER BY ${sort === 'newest' ? 'created_at DESC' : 'match_score DESC'}` });
    if (result.rows.length) {
      list = result.rows.map(row => {
        const record = dbRow<Record<string, unknown>>(row);
        return { id: String(record.id), company: String(record.company), role: String(record.role), location: String(record.location), level: String(record.level), salary: String(record.salary), match: Number(record.match_score), tags: JSON.parse(String(record.tags_json)) as string[], logo: String(record.logo), verified: Boolean(record.verified), posted: String(record.posted), url: String(record.url), source: typeof record.source === 'string' ? record.source : undefined };
      });
      source = 'SQLite';
    }
  }

  const filtered = list.filter(job =>
    (!q || source === 'Himalayas' || `${job.role} ${job.company} ${job.tags.join(' ')}`.toLowerCase().includes(q)) &&
    (!location || job.location.toLowerCase().includes(location)) &&
    (!level || job.level === level) &&
    (!remote || job.location.toLowerCase().includes('remote')) &&
    (!salaryListed || job.salary !== 'Salary not listed')
  );
  if (sort !== 'newest') filtered.sort((a, b) => b.match - a.match);
  return NextResponse.json({ jobs: filtered, hasMore }, { headers: { 'X-Jobs-Source': source, 'Cache-Control': 's-maxage=300, stale-while-revalidate=3600' } });
}
