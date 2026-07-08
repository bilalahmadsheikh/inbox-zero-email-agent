import prisma from "@/utils/prisma";

export type DbConnectionLimits = {
  database: string;
  maxConnections: number;
  reservedConnections: number | null;
  superuserReservedConnections: number | null;
  totalConnections: number;
  clientConnections: number;
  activeConnections: number;
  idleConnections: number;
  idleInTransactionConnections: number;
  waitingConnections: number;
};

export type DbConnectionGroup = {
  userName: string | null;
  database: string | null;
  applicationName: string;
  clientAddress: string;
  state: string;
  connectionCount: number;
  oldestStateAgeSeconds: number | null;
  oldestBackendAgeSeconds: number | null;
};

export type DbConnectionSession = {
  pid: number;
  userName: string | null;
  database: string | null;
  applicationName: string;
  clientAddress: string;
  backendType: string | null;
  state: string;
  waitEventType: string | null;
  waitEvent: string | null;
  backendAgeSeconds: number | null;
  stateAgeSeconds: number | null;
  queryAgeSeconds: number | null;
  transactionAgeSeconds: number | null;
  querySnippet: string;
};

export type TerminatedDbConnection = {
  pid: number;
  userName: string | null;
  applicationName: string;
  clientAddress: string;
  idleAgeSeconds: number | null;
  querySnippet: string;
  terminated: boolean;
};

export type DbConnectionSnapshot = Awaited<
  ReturnType<typeof getDbConnectionSnapshot>
>;

export async function getDbConnectionSnapshot() {
  const limitsRows = await prisma.$queryRaw<DbConnectionLimits[]>`
    select
      current_database() as "database",
      current_setting('max_connections')::int as "maxConnections",
      nullif(current_setting('reserved_connections', true), '')::int as "reservedConnections",
      nullif(current_setting('superuser_reserved_connections', true), '')::int as "superuserReservedConnections",
      count(*)::int as "totalConnections",
      count(*) filter (where backend_type = 'client backend')::int as "clientConnections",
      count(*) filter (where backend_type = 'client backend' and state = 'active')::int as "activeConnections",
      count(*) filter (where backend_type = 'client backend' and state = 'idle')::int as "idleConnections",
      count(*) filter (where backend_type = 'client backend' and state = 'idle in transaction')::int as "idleInTransactionConnections",
      count(*) filter (where backend_type = 'client backend' and wait_event_type is not null)::int as "waitingConnections"
    from pg_stat_activity;
  `;

  const grouped = await prisma.$queryRaw<DbConnectionGroup[]>`
    select
      usename as "userName",
      datname as "database",
      coalesce(nullif(application_name, ''), '(blank)') as "applicationName",
      coalesce(client_addr::text, 'local') as "clientAddress",
      coalesce(state, '(none)') as "state",
      count(*)::int as "connectionCount",
      max(extract(epoch from now() - state_change))::int as "oldestStateAgeSeconds",
      max(extract(epoch from now() - backend_start))::int as "oldestBackendAgeSeconds"
    from pg_stat_activity
    where backend_type = 'client backend'
    group by usename, datname, application_name, client_addr, state
    order by "connectionCount" desc, "oldestStateAgeSeconds" desc nulls last;
  `;

  const sessions = await prisma.$queryRaw<DbConnectionSession[]>`
    select
      pid,
      usename as "userName",
      datname as "database",
      coalesce(nullif(application_name, ''), '(blank)') as "applicationName",
      coalesce(client_addr::text, 'local') as "clientAddress",
      backend_type as "backendType",
      coalesce(state, '(none)') as "state",
      wait_event_type as "waitEventType",
      wait_event as "waitEvent",
      extract(epoch from now() - backend_start)::int as "backendAgeSeconds",
      extract(epoch from now() - state_change)::int as "stateAgeSeconds",
      extract(epoch from now() - query_start)::int as "queryAgeSeconds",
      extract(epoch from now() - xact_start)::int as "transactionAgeSeconds",
      left(regexp_replace(coalesce(query, ''), '\\s+', ' ', 'g'), 260) as "querySnippet"
    from pg_stat_activity
    where backend_type = 'client backend'
    order by
      case when state = 'active' then 0 else 1 end,
      extract(epoch from now() - state_change) desc nulls last
    limit 100;
  `;

  return {
    capturedAt: new Date().toISOString(),
    limits: limitsRows[0],
    grouped,
    sessions,
  };
}

export async function terminateIdleDbConnections({
  minIdleSeconds,
}: {
  minIdleSeconds: number;
}) {
  const rows = await prisma.$queryRaw<TerminatedDbConnection[]>`
    with candidates as (
      select
        pid,
        usename,
        coalesce(nullif(application_name, ''), '(blank)') as application_name,
        coalesce(client_addr::text, 'local') as client_addr,
        extract(epoch from now() - state_change)::int as idle_age_seconds,
        left(regexp_replace(coalesce(query, ''), '\\s+', ' ', 'g'), 260) as query_snippet
      from pg_stat_activity
      where datname = current_database()
        and backend_type = 'client backend'
        and pid <> pg_backend_pid()
        and usename = current_user
        and state = 'idle'
        and extract(epoch from now() - state_change) >= ${minIdleSeconds}
    )
    select
      pid,
      usename as "userName",
      application_name as "applicationName",
      client_addr as "clientAddress",
      idle_age_seconds as "idleAgeSeconds",
      query_snippet as "querySnippet",
      pg_terminate_backend(pid) as terminated
    from candidates
    order by idle_age_seconds desc;
  `;

  return {
    terminatedCount: rows.filter((row) => row.terminated).length,
    sessions: rows,
  };
}
