using System;
using System.Configuration;
using System.IO;
using System.Runtime.Serialization.Formatters.Binary;
using System.Threading;

namespace Infrastructure.Services
{
    /// <summary>
    /// Deliberately uses old/removed .NET APIs so migration agents
    /// have real breaking-change patterns to detect and fix.
    /// </summary>
    public class ReportArchiveService
    {
        private Thread _backgroundThread;

        public ArchivedReport LoadArchivedReport(int id)
        {
            string archivePath = ConfigurationManager.AppSettings["ArchivePath"] ?? "archives";
            string filePath = Path.Combine(archivePath, $"report-{id}.bin");

            using (FileStream stream = new FileStream(filePath, FileMode.Open))
            {
                // BC: BinaryFormatter is obsolete/removed starting .NET 8
                BinaryFormatter formatter = new BinaryFormatter();
                return (ArchivedReport)formatter.Deserialize(stream);
            }
        }

        public void StartBackgroundArchiving()
        {
            _backgroundThread = new Thread(() =>
            {
                while (true)
                {
                    Thread.Sleep(5000);
                    // pretend archiving work
                }
            });
            _backgroundThread.Start();
        }

        public void CancelBackgroundArchiving()
        {
            // BC: Thread.Abort() is removed on .NET Core / unsupported
            _backgroundThread?.Abort();
        }
    }

    [Serializable]
    public class ArchivedReport
    {
        public int Id { get; set; }
        public string Title { get; set; }
        public DateTime CreatedAt { get; set; }
    }
}
