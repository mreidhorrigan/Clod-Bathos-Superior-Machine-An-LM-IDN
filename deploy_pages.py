#!/usr/bin/env python3
"""deploy_pages.py — build dist/web and publish it to the gh-pages branch.

GitHub Pages serves the game from the `gh-pages` branch:
    python3 deploy_pages.py        # build + force-push gh-pages (re-run to redeploy)

One-time setup (repo must be PUBLIC for Pages on a free plan):
    gh api -X POST repos/mreidhorrigan/Clod-Bathos-Superior-Machine-An-LM-IDN/pages \
        -f 'source[branch]=gh-pages' -f 'source[path]=/'
    (or Settings → Pages → Deploy from a branch → gh-pages / root)

Game URL: https://mreidhorrigan.github.io/Clod-Bathos-Superior-Machine-An-LM-IDN/

The branch holds ONLY the built site (fresh single commit each deploy — dist/
stays out of main, per repo convention). An Actions auto-deploy alternative
sits at tools/pages.workflow.yml; pushing it into .github/workflows/ requires
`gh auth refresh -s workflow` first — until then, this script is the way.
"""
import os, shutil, subprocess, sys

ROOT   = os.path.dirname(os.path.abspath(__file__))
WEB    = os.path.join(ROOT, "dist", "web")
REMOTE = "https://github.com/mreidhorrigan/Clod-Bathos-Superior-Machine-An-LM-IDN.git"

def sh(*cmd, cwd=ROOT):
    print("$ " + " ".join(cmd))
    subprocess.run(cmd, check=True, cwd=cwd)

def main():
    sh(sys.executable, "build.py", "web")
    open(os.path.join(WEB, ".nojekyll"), "w").close()   # serve files verbatim
    git_dir = os.path.join(WEB, ".git")
    if os.path.isdir(git_dir):
        shutil.rmtree(git_dir)
    try:
        sh("git", "init", "-q", "-b", "gh-pages", cwd=WEB)
        sh("git", "add", "-A", cwd=WEB)
        sh("git", "-c", "user.name=deploy_pages.py", "-c", "user.email=deploy@local",
           "commit", "-q", "-m", "Deploy web build to GitHub Pages", cwd=WEB)
        sh("git", "push", "-f", REMOTE, "gh-pages:gh-pages", cwd=WEB)
    finally:
        if os.path.isdir(git_dir):
            shutil.rmtree(git_dir)                      # leave dist/web a plain folder
    print("\nDeployed branch gh-pages.")
    print("If Pages isn't enabled yet, see the docstring (repo must be public).")
    print("URL: https://mreidhorrigan.github.io/Clod-Bathos-Superior-Machine-An-LM-IDN/")

if __name__ == "__main__":
    main()
