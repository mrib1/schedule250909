      # To learn more about how to use Nix to configure your environment
      # see: https://developers.google.com/idx/guides/customize-idx-env
      { pkgs, ... }:
      let
        installAndPrebuildScript = pkgs.writeShellApplication {
          name = "install-and-prebuild";
          text = builtins.readFile ../scripts/install_and_prebuild.sh;
        };
       startAndroidScript = pkgs.writeShellApplication {
          name = "start-android";
          runtimeInputs = [ pkgs.android-tools pkgs.nodejs_20 ];
          text = builtins.readFile ../scripts/start_android.sh;
        };
      in
      {
        # Which nixpkgs channel to use.
        channel = "stable-23.11"; # or "unstable"
        # Use https://search.nixos.org/packages to find packages
        packages = [ pkgs.nodejs_20 pkgs.nodejs_20 pkgs.jdk21_headless pkgs.gradle pkgs.android-tools ];
        # Sets environment variables in the workspace
        env = { EXPO_USE_FAST_RESOLVER = "1"; };
        idx = {
          # Search for the extensions you want on https://open-vsx.org/ and use "publisher.id"
          extensions = [
            "msjsdiag.vscode-react-native"
            "fwcd.kotlin"
          ];
          workspace = {
            onCreate = {
              "install-and-prebuild" = "${installAndPrebuildScript}/bin/install-and-prebuild";
            };
            onStart = {
              "startAndroidEmulator" = "${startAndroidScript}/bin/start-android";
            };
          };
        };
      }