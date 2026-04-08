using System.Security.Cryptography;
using System.Text;

namespace Moonlauncher.SecurityBroker;

internal static class Program
{
    private static int Main(string[] args)
    {
        if (args.Length < 2)
        {
            Console.Error.WriteLine("Usage: protect <text> | unprotect <base64> | sign <text> <secret> | verify <text> <signature> <secret>");
            return 1;
        }

        var command = args[0].ToLowerInvariant();
        try
        {
            return command switch
            {
                "protect" => Protect(args[1]),
                "unprotect" => Unprotect(args[1]),
                "sign" => Sign(args),
                "verify" => Verify(args),
                _ => Unknown(command),
            };
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.Message);
            return 2;
        }
    }

    private static int Unknown(string command)
    {
        Console.Error.WriteLine($"Unknown command: {command}");
        return 1;
    }

    private static int Protect(string plainText)
    {
        var bytes = Encoding.UTF8.GetBytes(plainText);
        var protectedBytes = ProtectedData.Protect(bytes, null, DataProtectionScope.CurrentUser);
        Console.Write(Convert.ToBase64String(protectedBytes));
        return 0;
    }

    private static int Unprotect(string payload)
    {
        var encrypted = Convert.FromBase64String(payload);
        var decrypted = ProtectedData.Unprotect(encrypted, null, DataProtectionScope.CurrentUser);
        Console.Write(Encoding.UTF8.GetString(decrypted));
        return 0;
    }

    private static int Sign(string[] args)
    {
        if (args.Length < 3)
        {
            Console.Error.WriteLine("Usage: sign <text> <secret>");
            return 1;
        }

        var text = Encoding.UTF8.GetBytes(args[1]);
        var secret = Encoding.UTF8.GetBytes(args[2]);
        using var hmac = new HMACSHA256(secret);
        var hash = hmac.ComputeHash(text);
        Console.Write(Convert.ToHexString(hash).ToLowerInvariant());
        return 0;
    }

    private static int Verify(string[] args)
    {
        if (args.Length < 4)
        {
            Console.Error.WriteLine("Usage: verify <text> <signature> <secret>");
            return 1;
        }

        var text = Encoding.UTF8.GetBytes(args[1]);
        var signature = args[2].Trim().ToLowerInvariant();
        var secret = Encoding.UTF8.GetBytes(args[3]);
        using var hmac = new HMACSHA256(secret);
        var hash = Convert.ToHexString(hmac.ComputeHash(text)).ToLowerInvariant();
        var ok = CryptographicOperations.FixedTimeEquals(
            Encoding.ASCII.GetBytes(hash),
            Encoding.ASCII.GetBytes(signature)
        );

        Console.Write(ok ? "true" : "false");
        return ok ? 0 : 3;
    }
}
