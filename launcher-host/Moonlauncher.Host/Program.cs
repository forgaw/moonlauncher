using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Moonlauncher.Host;

internal sealed record HostBootstrapResult(bool Ok, string? Url, int BackendPid, string? Error);

internal static class Program
{
    private const string HostResultPrefix = "MOONLAUNCHER_HOST_RESULT:";

    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();

        var appDir = AppContext.BaseDirectory;
        var loaderPath = Path.Combine(appDir, "moonlaunchr_loader.ps1");
        if (!File.Exists(loaderPath))
        {
            MessageBox.Show(
                $"Скрипт загрузчика не найден:\n{loaderPath}",
                "moonlauncher",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            return;
        }

        var bootstrap = Bootstrap(loaderPath, appDir);
        if (!bootstrap.Ok || string.IsNullOrWhiteSpace(bootstrap.Url))
        {
            MessageBox.Show(
                $"Не удалось запустить лаунчер.\nЛог сохранен по пути:\n{GetStartupLogPath()}",
                "moonlauncher",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            return;
        }

        using var form = new LauncherWindow(bootstrap.Url, bootstrap.BackendPid);
        Application.Run(form);
    }

    private static HostBootstrapResult Bootstrap(string loaderPath, string appDir)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = $"-ExecutionPolicy Bypass -File \"{loaderPath}\" -DesktopMode -HostMode",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
            WorkingDirectory = appDir,
        };

        using var process = Process.Start(startInfo);
        if (process == null)
        {
            WriteStartupLog(1, string.Empty, "Bootstrap process was not started.");
            return new HostBootstrapResult(false, null, 0, "Bootstrap process was not started.");
        }

        var stdout = process.StandardOutput.ReadToEnd();
        var stderr = process.StandardError.ReadToEnd();
        process.WaitForExit();

        if (process.ExitCode != 0)
        {
            WriteStartupLog(process.ExitCode, stdout, stderr);
            return new HostBootstrapResult(false, null, 0, $"Bootstrap exit code: {process.ExitCode}");
        }

        var payloadLine = stdout
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
            .LastOrDefault(line => line.StartsWith(HostResultPrefix, StringComparison.Ordinal));

        if (payloadLine == null)
        {
            WriteStartupLog(process.ExitCode, stdout, "Host result payload was not found.");
            return new HostBootstrapResult(false, null, 0, "Host result payload was not found.");
        }

        try
        {
            var payload = payloadLine[HostResultPrefix.Length..];
            using var document = JsonDocument.Parse(payload);
            var root = document.RootElement;
            var ok = root.TryGetProperty("ok", out var okProp) && okProp.GetBoolean();
            var url = root.TryGetProperty("url", out var urlProp) ? urlProp.GetString() : null;
            var pid = root.TryGetProperty("pid", out var pidProp) ? pidProp.GetInt32() : 0;

            if (!ok || string.IsNullOrWhiteSpace(url) || pid <= 0)
            {
                WriteStartupLog(process.ExitCode, stdout, "Host payload is invalid.");
                return new HostBootstrapResult(false, null, 0, "Host payload is invalid.");
            }

            return new HostBootstrapResult(true, url, pid, null);
        }
        catch (Exception ex)
        {
            WriteStartupLog(process.ExitCode, stdout, $"{stderr}{Environment.NewLine}{ex}");
            return new HostBootstrapResult(false, null, 0, ex.Message);
        }
    }

    private static string GetStartupLogPath()
    {
        var userHome = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var folder = Path.Combine(userHome, "Moonlauncher");
        Directory.CreateDirectory(folder);
        return Path.Combine(folder, "launcher-start.log");
    }

    private static void WriteStartupLog(int exitCode, string stdout, string stderr)
    {
        var logPath = GetStartupLogPath();
        var text = new StringBuilder()
            .AppendLine($"Код выхода: {exitCode}")
            .AppendLine()
            .AppendLine("STDOUT:")
            .AppendLine(stdout)
            .AppendLine()
            .AppendLine("STDERR:")
            .AppendLine(stderr)
            .ToString();
        File.WriteAllText(logPath, text, Encoding.UTF8);
    }
}

internal sealed class LauncherWindow : Form
{
    private readonly string startUrl;
    private readonly int backendPid;
    private readonly WebView2 webView;
    private readonly string preferredWebViewDir;

    public LauncherWindow(string startUrl, int backendPid)
    {
        this.startUrl = startUrl;
        this.backendPid = backendPid;
        preferredWebViewDir = ResolvePreferredWebViewUserDataDir();

        Text = "moonlauncher";
        Width = 1280;
        Height = 800;
        MinimumSize = new Size(1024, 700);
        StartPosition = FormStartPosition.CenterScreen;

        ApplyWindowIcon();

        webView = new WebView2
        {
            Dock = DockStyle.Fill,
        };

        Controls.Add(webView);
        Load += OnLoadAsync;
        FormClosed += OnClosed;
    }

    private void ApplyWindowIcon()
    {
        try
        {
            var candidates = new[]
            {
                Path.Combine(AppContext.BaseDirectory, "moonlauncher.ico"),
                Path.Combine(AppContext.BaseDirectory, "Assets", "moonlauncher.ico"),
            };

            foreach (var iconPath in candidates)
            {
                if (!File.Exists(iconPath))
                {
                    continue;
                }

                using var stream = File.OpenRead(iconPath);
                Icon = new Icon(stream);
                return;
            }
        }
        catch
        {
            
        }
    }

    private async void OnLoadAsync(object? sender, EventArgs e)
    {
        try
        {
            await InitializeWebViewWithFallbackAsync();
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "Не удалось инициализировать окно приложения. Проверьте WebView2 Runtime и права доступа к папке профиля.\n\n"
                + $"Папка профиля WebView2: {preferredWebViewDir}\n\n"
                + ex.Message,
                "moonlauncher",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            Close();
        }
    }

    private async Task InitializeWebViewWithFallbackAsync()
    {
        var fallbackDir = Path.Combine(Path.GetTempPath(), "Moonlauncher", "WebView2");
        var candidates = new List<string> { preferredWebViewDir };

        if (!string.Equals(preferredWebViewDir, fallbackDir, StringComparison.OrdinalIgnoreCase))
        {
            candidates.Add(fallbackDir);
        }

        Exception? lastError = null;
        foreach (var candidate in candidates)
        {
            try
            {
                Directory.CreateDirectory(candidate);
                var environment = await CoreWebView2Environment.CreateAsync(
                    browserExecutableFolder: null,
                    userDataFolder: candidate
                );
                await webView.EnsureCoreWebView2Async(environment);
                if (webView.CoreWebView2 != null)
                {
                    webView.CoreWebView2.WebMessageReceived -= HandleWebMessage;
                    webView.CoreWebView2.WebMessageReceived += HandleWebMessage;
                }
                webView.Source = new Uri(startUrl);
                return;
            }
            catch (Exception ex)
            {
                lastError = ex;
            }
        }

        throw lastError ?? new InvalidOperationException("WebView2 initialization failed.");
    }

    private void HandleWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        try
        {
            var message = args.TryGetWebMessageAsString();
            if (!string.Equals(message, "moonlauncher:close", StringComparison.Ordinal))
            {
                return;
            }

            if (IsHandleCreated)
            {
                BeginInvoke(new Action(Close));
            }
            else
            {
                Close();
            }
        }
        catch
        {
            
        }
    }

    private static string ResolvePreferredWebViewUserDataDir()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrWhiteSpace(localAppData))
        {
            return Path.Combine(Path.GetTempPath(), "Moonlauncher", "WebView2");
        }

        return Path.Combine(localAppData, "Moonlauncher", "WebView2");
    }

    private void OnClosed(object? sender, FormClosedEventArgs e)
    {
        if (backendPid <= 0)
        {
            return;
        }

        try
        {
            using var process = Process.GetProcessById(backendPid);
            if (!process.HasExited)
            {
                process.Kill(true);
            }
        }
        catch
        {
            
        }
    }
}
