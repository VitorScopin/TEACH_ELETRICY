using System.Globalization;
using System.Text;
using System.Text.Json;
using GodSharp.Opc.Da;
using GodSharp.Opc.Da.Options;

internal static class Program
{
    private const string DefaultProgId = "CoDeSys.OPC.DA";
    private const string GroupName = "TeachTraffic";
    private static readonly object SyncRoot = new();

    private static IOpcDaClient? _client;
    private static string _currentProgId = string.Empty;
    private static string _currentHost = string.Empty;
    private static HashSet<string> _configuredTags = new(StringComparer.OrdinalIgnoreCase);

    private static int Main()
    {
        Console.InputEncoding = Encoding.UTF8;
        Console.OutputEncoding = Encoding.UTF8;

        string? line;
        while ((line = Console.ReadLine()) != null)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            HandleRequest(line);
        }

        lock (SyncRoot) DisconnectInternal();
        return 0;
    }

    private static void HandleRequest(string jsonLine)
    {
        try
        {
            using JsonDocument document = JsonDocument.Parse(jsonLine);
            JsonElement request = document.RootElement;
            string command = GetRequiredString(request, "command");

            object? result = command.ToLowerInvariant() switch
            {
                "ping" => Ping(),
                "connect" => Connect(request),
                "disconnect" => Disconnect(),
                "read" => Read(request),
                "write" => Write(request),
                _ => throw new InvalidOperationException($"Comando OPC DA desconhecido: {command}")
            };

            ReplySuccess(result);
        }
        catch (Exception error)
        {
            ReplyError(error.GetBaseException().Message);
        }
    }

    private static object Ping()
    {
        lock (SyncRoot)
        {
            return new
            {
                bridge = "TeachOpcDaBridge",
                version = 1,
                connected = _client?.Connected == true,
                progId = _currentProgId,
                host = _currentHost,
                tagCount = _configuredTags.Count,
                architecture = Environment.Is64BitProcess ? "x64" : "x86"
            };
        }
    }

    private static object Connect(JsonElement request)
    {
        string progId = GetOptionalString(request, "progId");
        if (string.IsNullOrWhiteSpace(progId)) progId = DefaultProgId;

        string host = NormalizeHost(GetOptionalString(request, "host"));
        string[] tags = GetRequiredStringArray(request, "tags")
            .Select(tag => tag.Trim())
            .Where(tag => !string.IsNullOrWhiteSpace(tag))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        lock (SyncRoot)
        {
            DisconnectInternal();

            var groupTags = tags
                .Select((name, index) => new Tag(name, index + 1))
                .ToList();

            var options = new DaClientOptions(
                new ServerData
                {
                    Host = host,
                    ProgId = progId,
                    Groups = new List<GroupData>
                    {
                        new()
                        {
                            Name = GroupName,
                            ClientHandle = 1,
                            UpdateRate = 100,
                            IsSubscribed = false,
                            Tags = groupTags
                        }
                    }
                },
                OnDataChanged,
                OnServerShutdown,
                OnAsyncReadCompleted,
                OnAsyncWriteCompleted
            );

            IOpcDaClient client = DaClientFactory.Instance.CreateOpcNetApiClient(options);

            try
            {
                if (!client.Connect())
                    throw new InvalidOperationException("O servidor OPC DA recusou a conexão.");
            }
            catch
            {
                TryDisconnectAndDispose(client);
                throw;
            }

            _client = client;
            _currentProgId = progId;
            _currentHost = host;
            _configuredTags = new HashSet<string>(tags, StringComparer.OrdinalIgnoreCase);

            return new
            {
                connected = true,
                progId,
                host,
                group = GroupName,
                tagCount = tags.Length,
                architecture = Environment.Is64BitProcess ? "x64" : "x86"
            };
        }
    }

    private static object Disconnect()
    {
        lock (SyncRoot)
        {
            DisconnectInternal();
            return new { connected = false };
        }
    }

    private static object Read(JsonElement request)
    {
        string[] requestedTags = GetRequiredStringArray(request, "tags");

        lock (SyncRoot)
        {
            IOpcDaClient client = RequireConnectedClient();
            EnsureConfigured(requestedTags);

            return client.Groups[GroupName]
                .Reads(requestedTags)
                .Select(result => new
                {
                    tag = result.Result.ItemName,
                    value = NormalizeForJson(result.Result.Value),
                    quality = result.Result.Quality,
                    timestamp = result.Result.Timestamp,
                    ok = result.Ok,
                    code = result.Code
                })
                .ToArray();
        }
    }

    private static object Write(JsonElement request)
    {
        string[] requestedTags = GetRequiredStringArray(request, "tags");
        object?[] values = GetRequiredValueArray(request, "values");

        if (requestedTags.Length != values.Length)
            throw new InvalidOperationException("A quantidade de tags é diferente da quantidade de valores.");

        lock (SyncRoot)
        {
            IOpcDaClient client = RequireConnectedClient();
            EnsureConfigured(requestedTags);

            var writes = requestedTags
                .Select((tag, index) => new KeyValuePair<string, object>(
                    tag,
                    values[index] ?? throw new InvalidOperationException($"O valor da tag '{tag}' não pode ser nulo.")
                ))
                .ToArray();

            var results = client.Groups[GroupName]
                .Writes(writes)
                .Select(result => new
                {
                    tag = result.Result.Key,
                    ok = result.Ok,
                    code = result.Code
                })
                .ToArray();

            if (results.Any(result => !result.ok))
                throw new InvalidOperationException("Falha ao escrever uma ou mais tags OPC DA.");

            return results;
        }
    }

    private static void EnsureConfigured(IEnumerable<string> tags)
    {
        foreach (string tag in tags)
            if (!_configuredTags.Contains(tag))
                throw new InvalidOperationException($"Tag OPC DA não registrada na conexão: {tag}");
    }

    private static IOpcDaClient RequireConnectedClient()
    {
        if (_client == null || !_client.Connected)
            throw new InvalidOperationException("OPC DA desconectado.");

        if (!_client.Groups.ContainsKey(GroupName))
            throw new InvalidOperationException($"O grupo OPC DA '{GroupName}' não está disponível.");

        return _client;
    }

    private static void DisconnectInternal()
    {
        IOpcDaClient? client = _client;
        _client = null;
        _currentProgId = string.Empty;
        _currentHost = string.Empty;
        _configuredTags.Clear();

        if (client != null) TryDisconnectAndDispose(client);
    }

    private static void TryDisconnectAndDispose(IOpcDaClient client)
    {
        try { client.Disconnect(); } catch {}
        try { client.Dispose(); } catch {}
    }

    private static string NormalizeHost(string host)
    {
        string normalized = host.Trim();
        if (string.IsNullOrWhiteSpace(normalized) ||
            normalized.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
            normalized.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
            normalized.Equals(".", StringComparison.OrdinalIgnoreCase))
            return string.Empty;

        return normalized;
    }

    private static string GetRequiredString(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out JsonElement property))
            throw new InvalidOperationException($"Campo obrigatório ausente: {propertyName}");

        string? value = property.GetString();
        if (string.IsNullOrWhiteSpace(value))
            throw new InvalidOperationException($"Campo inválido: {propertyName}");

        return value;
    }

    private static string GetOptionalString(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out JsonElement property) || property.ValueKind == JsonValueKind.Null)
            return string.Empty;
        return property.GetString() ?? string.Empty;
    }

    private static string[] GetRequiredStringArray(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out JsonElement property) || property.ValueKind != JsonValueKind.Array)
            throw new InvalidOperationException($"Lista inválida ou ausente: {propertyName}");

        string[] result = property.EnumerateArray()
            .Select(item => item.ValueKind == JsonValueKind.String
                ? item.GetString() ?? string.Empty
                : throw new InvalidOperationException($"A lista '{propertyName}' deve conter somente textos."))
            .ToArray();

        if (result.Length == 0) throw new InvalidOperationException($"A lista '{propertyName}' está vazia.");
        return result;
    }

    private static object?[] GetRequiredValueArray(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out JsonElement property) || property.ValueKind != JsonValueKind.Array)
            throw new InvalidOperationException($"Lista inválida ou ausente: {propertyName}");

        return property.EnumerateArray().Select(ConvertJsonValue).ToArray();
    }

    private static object? ConvertJsonValue(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.String => value.GetString(),
        JsonValueKind.Number when value.TryGetInt32(out int i) => i,
        JsonValueKind.Number when value.TryGetInt64(out long l) => l,
        JsonValueKind.Number => value.GetDouble(),
        JsonValueKind.Null => null,
        _ => throw new InvalidOperationException($"Tipo JSON não suportado: {value.ValueKind}")
    };

    private static object? NormalizeForJson(object? value)
    {
        if (value == null) return null;
        if (value is bool || value is string || value is byte || value is sbyte ||
            value is short || value is ushort || value is int || value is uint ||
            value is long || value is ulong || value is float || value is double || value is decimal)
            return value;

        if (value is DateTime dateTime)
            return dateTime.ToString("O", CultureInfo.InvariantCulture);

        if (value is IConvertible)
        {
            try { return Convert.ToDouble(value, CultureInfo.InvariantCulture); } catch {}
        }

        return Convert.ToString(value, CultureInfo.InvariantCulture);
    }

    private static void ReplySuccess(object? result) => WriteResponse(new { ok = true, result, error = (string?)null });
    private static void ReplyError(string error) => WriteResponse(new { ok = false, result = (object?)null, error });

    private static void WriteResponse(object response)
    {
        Console.WriteLine(JsonSerializer.Serialize(response));
        Console.Out.Flush();
    }

    private static void OnDataChanged(DataChangedOutput output) {}
    private static void OnServerShutdown(Server server, string reason)
    {
        lock (SyncRoot)
        {
            _client = null;
            _currentProgId = string.Empty;
            _currentHost = string.Empty;
            _configuredTags.Clear();
        }
    }
    private static void OnAsyncReadCompleted(AsyncReadCompletedOutput output) {}
    private static void OnAsyncWriteCompleted(AsyncWriteCompletedOutput output) {}
}
