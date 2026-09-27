"""Synthetic ELF byte parsing only: no binary execution or native payload access."""
from pathlib import Path
from types import ModuleType
import struct, unittest
ROOT = Path(__file__).resolve().parents[2]

def fixture(kind="valid", tag=1):
    data=bytearray(640)
    data[:6]=b"\x7fELF\x02\x01"
    struct.pack_into("<H",data,18,62)
    struct.pack_into("<Q",data,32,64)
    struct.pack_into("<HH",data,54,56,2)
    struct.pack_into("<IIQQQQQQ",data,64,1,4,0,0x400000,0,640,640,4096)
    struct.pack_into("<IIQQQQQQ",data,120,2,4,256,0x400100,0,80,80,8)
    table=b"\0libc.so\0"
    data[512:512+len(table)]=table
    size=len(table)
    offset=1
    if kind=="offset":
        offset=size
        data[512+size:512+size+5]=b"evil\0"
    if kind=="terminator":size-=1
    if kind=="segment":size=129
    entries=[(5,0x400200),(10,size),(tag,offset),(0,0)]
    if kind=="missing":entries=[(5,0x400200),(tag,offset),(0,0)]
    if kind=="duplicate":entries=[(5,0x400200),(10,size),(10,size),(tag,offset),(0,0)]
    for i,pair in enumerate(entries):struct.pack_into("<qQ",data,256+16*i,*pair)
    return bytes(data)

def load(mode):
    source = ROOT / "tools/g7-runtime-binary-inputs.py"
    m=ModuleType("byte_parser_candidate")
    exec(compile(source.read_text(),str(source),"exec",optimize=mode),m.__dict__)
    return m

class StringBounds(unittest.TestCase):
    def test_valid_needed_rpath_runpath(self):
        for mode in (0,1,2):
            m=load(mode)
            for tag,name in ((1,"NEEDED"),(15,"RPATH"),(29,"RUNPATH")):
                with self.subTest(mode=mode,tag=tag):
                    raw=fixture(tag=tag); result=m.elf(raw)
                    self.assertEqual(result["dynamicDependencies"],[{"tag":name,"value":"libc.so"}])
                    self.assertEqual(result["sha256"],m.sha(raw))
                    self.assertEqual(result["bytes"],len(raw))
    def check_denied(self,kind):
        for mode in (0,1,2):
            m=load(mode)
            for tag in (1,15,29):
                with self.subTest(mode=mode,tag=tag,kind=kind):
                    with self.assertRaises(AssertionError):m.elf(fixture(kind,tag))
    def test_offset_outside_table(self):self.check_denied("offset")
    def test_terminator_outside_table(self):self.check_denied("terminator")
    def test_string_table_outside_load_segment(self):self.check_denied("segment")
    def test_missing_string_size(self):self.check_denied("missing")
    def test_ambiguous_string_size(self):self.check_denied("duplicate")


# Retained independent synthetic fixture, made self-contained for repository use.
def compatibility_fixture(kind='version'):
    d=bytearray(2048);d[:16]=b'\x7fELF\x02\x01\x01'+bytes(9)
    struct.pack_into('<HHIQQQIHHHHHH',d,16,3 if kind!='static' else 2,62,1,0,64,1792,0,64,56,1 if kind=='static' else 2,64,2,0)
    struct.pack_into('<IIQQQQQQ',d,64,1,4,256,0x600000,0,1536,1536,256)
    struct.pack_into('<IIQQQQQQ',d,120,2,4,512,0x600100,0,192,192,8)
    table=b'\0libx.so\0VER_1\0';d[1024:1024+len(table)]=table
    struct.pack_into('<IIQQQQIIQQ',d,1856,0,3,2,0x600300,1024,0 if kind=='empty' else len(table),0,0,1,0)
    entries=[]
    if kind not in ('static','no-table'):
        entries=[(5,0x600300),(10,0 if kind=='empty' else len(table))]
        if kind!='empty':entries += [(1,1),(15,1),(29,1)]
        # A null dynamic symbol, with a SysV hash containing no named symbols.
        entries += [(6,0x600480),(11,24),(4,0x6004a0)]
        struct.pack_into('<IIII',d,1440,1,1,0,0)
    if kind.startswith('version'):
        entries += [(0x6ffffffe,0x600400),(0x6fffffff,1)]
        library=1;name=table.index(b'VER_1')
        if kind=='version-lib-offset':library=len(table)
        if kind=='version-name-offset':name=len(table)
        if kind=='version-lib-terminator':library=name;entries[1]=(10,len(table)-1)
        if kind=='version-name-terminator':entries[1]=(10,len(table)-1)
        struct.pack_into('<HHIII',d,1280,1,1,library,16,0)
        struct.pack_into('<IHHII',d,1296,0,2,2,name,0)
    if kind=='segment-edge':
        struct.pack_into('<Q',d,64+32,1024+len(table)-256)
        struct.pack_into('<Q',d,64+40,1024+len(table)-256)
    if kind=='one-past-segment':
        struct.pack_into('<Q',d,64+32,1024+len(table)-257)
    if kind=='zero-offset':entries=[(5,0x600300),(10,len(table)),(1,0)]
    if kind=='last-nul':entries=[(5,0x600300),(10,len(table)),(1,len(table)-1)]
    if kind=='substring':entries=[(5,0x600300),(10,len(table)),(1,4)]
    for i,e in enumerate(entries+[(0,0)]):struct.pack_into('<qQ',d,512+16*i,*e)
    return bytes(d)


def empty_fixture(consumer=None, offset=0, location="inside", metadata="single"):
    data = bytearray(compatibility_fixture("empty"))
    # Selected PT_LOAD covers virtual [0x600000, 0x600600).
    address = {"inside": 0x600300, "last-byte": 0x6005ff,
               "one-past": 0x600600}[location]
    entries = [(5, address)]
    if metadata != "missing":
        entries.append((10, 0))
    if metadata == "duplicate":
        entries.append((10, 0))
    if consumer in (1, 15, 29):
        entries.append((consumer, offset))
    elif consumer in ("library", "name"):
        entries += [(0x6ffffffe, 0x600400), (0x6fffffff, 1)]
        struct.pack_into("<HHIII", data, 1280, 1,
                         0 if consumer == "library" else 1, offset, 16, 0)
        struct.pack_into("<IHHII", data, 1296, 0, 2, 2, offset, 0)
    data[512:704] = bytes(192)
    for i, entry in enumerate(entries + [(0, 0)]):
        struct.pack_into("<qQ", data, 512 + 16*i, *entry)
    return bytes(data)


class EmptyAndVersionBounds(unittest.TestCase):
    def test_empty_unused_valid(self):
        for mode in (0, 1, 2):
            module = load(mode)
            for raw in (compatibility_fixture("empty"), empty_fixture(),
                        empty_fixture(location="last-byte")):
                with self.subTest(mode=mode, sha=module.sha(raw)):
                    self.assertEqual(module.elf(raw), {
                        "sha256": module.sha(raw), "bytes": len(raw),
                        "interpreter": None, "dynamicDependencies": [],
                        "versionRequirements": []})

    def test_empty_consumers_rejected(self):
        for mode in (0, 1, 2):
            module = load(mode)
            for consumer in (1, 15, 29, "library", "name"):
                for offset in (0, 1):
                    with self.subTest(mode=mode, consumer=consumer, offset=offset):
                        with self.assertRaises(AssertionError):
                            module.elf(empty_fixture(consumer, offset))

    def test_empty_metadata_and_mapping_still_validated(self):
        for mode in (0, 1, 2):
            module = load(mode)
            for metadata in ("missing", "duplicate"):
                with self.subTest(mode=mode, metadata=metadata):
                    with self.assertRaises(AssertionError):
                        module.elf(empty_fixture(metadata=metadata))
            # Do not expand the existing half-open PT_LOAD selection policy.
            with self.subTest(mode=mode, location="one-past"):
                with self.assertRaises(StopIteration):
                    module.elf(empty_fixture(location="one-past"))

    def test_version_bounds_rejected(self):
        for mode in (0, 1, 2):
            module = load(mode)
            for kind in ("version-lib-offset", "version-name-offset",
                         "version-lib-terminator", "version-name-terminator",
                         "one-past-segment"):
                with self.subTest(mode=mode, kind=kind):
                    with self.assertRaises(AssertionError):
                        module.elf(compatibility_fixture(kind))

    def test_compatibility_controls(self):
        for mode in (0, 1, 2):
            module = load(mode)
            for kind in ("static", "no-table", "version", "segment-edge",
                         "zero-offset", "last-nul", "substring"):
                with self.subTest(mode=mode, kind=kind):
                    raw = compatibility_fixture(kind)
                    result = module.elf(raw)
                    value = {"zero-offset": "", "last-nul": "",
                             "substring": "x.so"}.get(kind, "libx.so")
                    tags = [] if kind in ("static", "no-table") else (
                        ["NEEDED"] if kind in ("zero-offset", "last-nul", "substring")
                        else ["NEEDED", "RPATH", "RUNPATH"])
                    self.assertEqual(result, {
                        "sha256": module.sha(raw), "bytes": len(raw),
                        "interpreter": None,
                        "dynamicDependencies": [{"tag": t, "value": value} for t in tags],
                        "versionRequirements": [{"library": "libx.so", "versions": [
                            {"name": "VER_1", "flags": 2}]}] if kind == "version" else []})


if __name__ == "__main__":
    unittest.main(verbosity=2)
