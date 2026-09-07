{
  description = "Timeful development shell";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/c8f90650c15282fa8656a041bfbbd2403997a9a7";
    systems.url = "github:nix-systems/default/future-26.11";
    flake-parts = {
      url = "github:hercules-ci/flake-parts/17c9d6cdfc60c64f4ee8d306f9bc0b4ccb51481e";
      inputs.nixpkgs-lib.url = "github:nix-community/nixpkgs.lib";
    };
    backlog-md.url = "github:MrLesk/Backlog.md/583f928dfa65266df994a4323566eb426446ad55";
  };

  outputs = inputs@{ flake-parts, systems, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = import systems;

      perSystem = { pkgs, system, ... }:
        let
          graphify-sql = pkgs.graphify.overridePythonAttrs (old: {
            propagatedBuildInputs = (old.propagatedBuildInputs or [ ]) ++ [
              pkgs.python3.pkgs.tree-sitter-sql
            ];
          });
          graphify-cli = pkgs.writeShellScriptBin "graphify" ''
            exec ${graphify-sql}/bin/graphify "$@"
          '';
          e2e = pkgs.writeShellScriptBin "e2e" ''
            set -euo pipefail
            export PATH="${pkgs.nodejs_26}/bin:$PATH"
            export PLAYWRIGHT_BROWSERS_PATH="${pkgs.playwright-driver.browsers}"
            REPO_ROOT="$(git rev-parse --show-toplevel)"
            cd "$REPO_ROOT/frontend"
            npm ci
            cd "$REPO_ROOT/e2e"
            npm ci
            exec npm run test:e2e -- "$@"
          '';
        in {
          packages = { inherit e2e; };
          apps.e2e = {
            type = "app";
            program = "${e2e}/bin/e2e";
          };
          devShells.default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_26
            pkgs.python3
            pkgs.go
            pkgs.playwright-driver.browsers
            graphify-cli
            inputs.backlog-md.packages.${system}.default
            pkgs.ripgrep
            pkgs.actionlint
          ];
          shellHook = ''
             export BACKLOG_CWD="$PWD"
             export PLAYWRIGHT_BROWSERS_PATH="${pkgs.playwright-driver.browsers}"
          '';
        };
      };
    };
}
