"""SQLite GraphPort. SQL stays here, never in domain/exchange/adapters."""
import json
from app.exchange import MODELS, RESERVED_AUDIT, ExchangeError

MAPPERS = {'entities':'_entity_from_row','records':'_record_from_row','relations':'_relation_from_row',
           'artifacts':'_artifact_from_row','findings':'_finding_from_row',
           'audit_events':'_audit_from_row','retrieval_events':'_retrieval_from_row'}

TABLES = {name: ('review_findings' if name == 'findings' else name) for name in MODELS}

class SqliteGraph:
    def __init__(self, store):
        self.store = store

    def snapshot_graph(self):
        # BEGIN establishes one consistent read snapshot spanning all tables.
        with self.store._connect() as conn:
            conn.execute('BEGIN')
            result = {}
            for table, mapper in MAPPERS.items():
                rows = conn.execute('SELECT * FROM '+TABLES[table]).fetchall()
                values = [getattr(self.store, mapper)(row).model_dump(mode='json', by_alias=True) for row in rows]
                result[table] = [v for v in values if table != 'audit_events' or v['action'] != RESERVED_AUDIT]
            conn.commit()
            return result

    def _insert(self, conn, table, value):
        model = MODELS[table].model_validate(value)
        fields = model.model_dump(mode='json')
        table = TABLES[table]
        columns = [row[1] for row in conn.execute('PRAGMA table_info('+table+')')]
        def cell(name):
            if name in fields: return fields[name]
            if name.endswith('_json'):
                data = fields[name[:-5]]
                return json.dumps(data,sort_keys=True) if data is not None else None
            for prefix, key in [('entity_','entity'),('from_','from_ref'),('to_','to_ref'),('subject_','subject')]:
                if name.startswith(prefix):
                    reference=fields.get(key)
                    field = 'entity_type' if prefix == 'entity_' and name == 'entity_type' else name[len(prefix):]
                    return reference.get(field) if reference else None
            raise ExchangeError('unmapped provider column: '+name)
        conn.execute('INSERT INTO '+table+'('+','.join(columns)+') VALUES ('+','.join('?' for _ in columns)+')', [cell(n) for n in columns])

    def import_empty_graph(self, sections, *, actor, root, digest):
        with self.store._connect() as conn:
            conn.execute('BEGIN IMMEDIATE')
            # Reciprocal supersession links are cyclic; defer, never disable, FK checks until commit.
            conn.execute('PRAGMA defer_foreign_keys=ON')
            # Recheck emptiness under the write transaction: no TOCTOU or conflict overwrite.
            if any(conn.execute('SELECT COUNT(*) FROM '+TABLES.get(t,t)).fetchone()[0] for t in [*MODELS,'idempotency_requests']):
                raise ExchangeError('fresh empty target required; IDs never remapped/overwritten')
            for table in MODELS:
                for row in sections[table]: self._insert(conn, table, row)
            if self.store._has_fts(conn):
                conn.execute('DELETE FROM records_fts')
                conn.execute('INSERT INTO records_fts(rowid,id,title,content) SELECT rowid,id,title,content FROM records')
            self.store.write_audit(conn,action=RESERVED_AUDIT,object_type='exchange',object_id=digest,
                                   actor=actor,scope_path=root,detail={'outcome':'success','counts':{k:len(v) for k,v in sections.items()},'replay_ledger_imported':False})
            # context manager atomically commits; exceptions/process death roll back all rows.
