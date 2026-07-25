#!/usr/bin/env python3
"""Assemble index.html - the whole RC Command game.  Usage: python3 build.py

The shipped game is a single self-contained index.html with no network dependencies and no
libraries at all - it is canvas 2D, every sprite is drawn in code, and every sound is
synthesized at runtime. Edit the files in src/, run this, commit the regenerated index.html.

  //@@INC:<path>@@  -> src/<path>
  /*@@CSS:<path>@*/ -> src/<path>, inlined into a <style>
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def check_syntax(js, label):
    """Parse a JS fragment with node, if node is available."""
    import subprocess
    import tempfile
    fd, tmp = tempfile.mkstemp(suffix='.js')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(js)
        for node in ('/opt/node22/bin/node', 'node'):
            try:
                r = subprocess.run([node, '--check', tmp], capture_output=True, text=True)
            except (FileNotFoundError, OSError):
                continue
            if r.returncode != 0:
                sys.exit('build.py: %s failed to parse:\n%s' % (label, (r.stderr or '')[:1200]))
            return
    finally:
        os.unlink(tmp)


GAME_SOURCES = ('rts.rules.js', 'rts.sprites.js', 'rts.audio.js',
                'rts.core.js', 'rts.render.js', 'rts.ui.js')


def check_collisions():
    """Fail if two source files define the same top-level name.

    Every file is concatenated into one global scope, so a duplicate silently overwrites -
    whichever script tag loads last wins, and the loser's callers get a function with the
    wrong signature. That is exactly how the music died: rts.audio.js defined _rtsDist for
    its waveshaper, rts.core.js already used that name for entity distance, core loaded
    second, and _rtsDist(14) threw on a missing second argument.
    """
    seen, dupes = {}, []
    pat = re.compile(r'^(?:function|var|const|let)\s+([A-Za-z_$][\w$]*)', re.M)
    for rel in GAME_SOURCES:
        for name in set(pat.findall(read(os.path.join(SRC, rel)))):
            if name in seen:
                dupes.append('%s: defined in both %s and %s' % (name, seen[name], rel))
            else:
                seen[name] = rel
    if dupes:
        sys.exit('build_command.py: duplicate top-level definitions -\n  ' + '\n  '.join(dupes))


def main():
    page = read(os.path.join(SRC, 'index.skeleton.html'))
    check_collisions()

    # Syntax-gate the game's own sources before they get buried in a 1.8 MB page, where a
    # parse error only shows up as a blank screen.
    for rel in GAME_SOURCES:
        check_syntax(read(os.path.join(SRC, rel)), rel)

    page = re.sub(r'(?:/\*|//)@@(?:INC|CSS):([\w./-]+)@@(?:\*/)?',
                  lambda m: read(os.path.join(SRC, m.group(1))), page)

    left = re.findall(r'@@[A-Z]+[^@]*@@', page)
    if left:
        sys.exit('build.py: unsubstituted markers remain: ' + ', '.join(sorted(set(left))))

    # Self-containment guard: the shipped page must LOAD nothing from outside itself.
    # Deliberately targets resource references rather than any occurrence of a URL - three.js
    # is full of XML namespace URIs like http://www.w3.org/1999/xhtml, which are identifiers
    # that are never fetched. A plain <a href> to somewhere is fine too; a <script src> is not.
    bad = [r for r in ('../', 'src="http', "src='http", '@import',
                       'unpkg.com', 'jsdelivr', 'cdnjs', 'googleapis.com') if r in page]
    if bad:
        sys.exit('build.py: the built page loads something external (%s). '
                 'RC Command ships as one self-contained file.' % ', '.join(map(repr, bad)))

    with open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(page)
    print('built index.html: %d lines, %.2f MB' % (page.count(chr(10)) + 1, len(page) / 1048576.0))


if __name__ == '__main__':
    main()
