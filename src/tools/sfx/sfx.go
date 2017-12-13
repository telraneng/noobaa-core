package main

import (
	"archive/zip"
	"compress/flate"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

const sfxKeyName string = "~~~sfx~~~"

var verbose = false
var executable = ""

func main() {
	executable = os.Args[0]
	flag.Parse()
	flag.BoolVar(&verbose, "verbose", false, "")
	flag.BoolVar(&verbose, "v", false, "")
	fmt.Println("Executable:", executable)

	reader, err := zip.OpenReader(executable)

	if err == nil {
		err = extractSFX(reader)
	} else {
		err = createSFX()
	}

	if err != nil {
		fmt.Println("ERROR:", err)
		os.Exit(1)
	}
}

func createSFX() error {
	exe := os.Args[0]
	target := flag.Arg(0)
	dir := flag.Arg(1)
	script := flag.Arg(2)

	if target == "" || dir == "" || script == "" {
		fmt.Println("Usage:", exe, "<target> <dir> <script>")
		os.Exit(1)
	}

	fmt.Println("Creating:", target, "from", dir, "script", script)

	reader, err := os.Open(exe)
	if err != nil {
		return err
	}
	defer reader.Close()

	info, err := reader.Stat()
	if err != nil {
		return err
	}

	incomplete := true
	writer, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, info.Mode().Perm())
	if err != nil {
		return err
	}
	defer func() {
		writer.Close()
		if incomplete {
			fmt.Println("Removing incomplete file:", target)
			os.Remove(target)
		}
	}()

	offset, err := io.Copy(writer, reader)
	if err != nil {
		return err
	}

	zipWriter := zip.NewWriter(writer)
	defer zipWriter.Close()

	zipWriter.RegisterCompressor(zip.Deflate, func(w io.Writer) (io.WriteCloser, error) {
		return flate.NewWriter(w, flate.DefaultCompression)
	})

	// Setting the offset is important - this will be written in the footer of the file
	// and allows the zip reader to detect where the executable ends and the zip data starts
	zipWriter.SetOffset(offset)

	sfxKeyWriter, err := zipWriter.Create(sfxKeyName)
	_, err = sfxKeyWriter.Write([]byte(script))
	if err != nil {
		return err
	}

	addedScript := false

	err = filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		name, err := filepath.Rel(dir, path)
		if err != nil {
			return err
		}
		if name == script {
			addedScript = true
		}
		return addFileToZip(zipWriter, name, path, info)
	})

	if err != nil {
		return err
	}

	if !addedScript {
		return errors.New("Script not found: " + script)
	}

	incomplete = false

	fmt.Println("done.")

	return nil
}

func extractSFX(reader *zip.ReadCloser) error {

	script := ""
	scriptArgs := flag.Args()

	tempdir, err := ioutil.TempDir("", "")
	if err != nil {
		return err
	}

	defer func() {
		fmt.Println("Removing temp dir:", tempdir)
		os.RemoveAll(tempdir)
	}()

	fmt.Println("Extracting to temp dir:", tempdir)

	for _, f := range reader.File {
		if f.Name == sfxKeyName {
			script, err = readString(f)
			if err != nil {
				return err
			}
		} else {
			err = extractFileFromZip(f, tempdir)
			if err != nil {
				return err
			}
		}
	}

	fmt.Println("Script:", script, scriptArgs)
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd.exe", "/c", script)
	} else {
		cmd = exec.Command("bash", script)
	}
	cmd.Args = append(cmd.Args, scriptArgs...)
	cmd.Dir = tempdir
	cmd.Stdout = os.Stdout

	err = cmd.Run()
	if err != nil {
		return err
	}

	fmt.Println("done.")

	return nil
}

func addFileToZip(zipWriter *zip.Writer, name string, path string, info os.FileInfo) error {

	if verbose {
		fmt.Println("Adding:", name)
	}

	hdr, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	hdr.Name = name
	hdr.Method = zip.Deflate

	writer, err := zipWriter.CreateHeader(hdr)
	if err != nil {
		return err
	}

	if info.IsDir() {
		return nil
	}

	reader, err := os.Open(path)
	if err != nil {
		return err
	}

	_, err = io.Copy(writer, reader)
	if err != nil {
		return err
	}

	return nil
}

func extractFileFromZip(f *zip.File, dir string) error {

	fullname := filepath.Join(dir, f.Name)
	perms := f.FileInfo().Mode().Perm()
	size := f.FileInfo().Size()

	if f.FileInfo().IsDir() {
		if verbose {
			fmt.Println("Extracting:", f.Name, "(dir)")
		}
		err := os.MkdirAll(fullname, perms)
		if err != nil {
			return err
		}
		return nil
	}

	if verbose {
		fmt.Println("Extracting:", f.Name, "size", size)
	}

	reader, err := f.Open()
	if err != nil {
		return err
	}
	defer reader.Close()

	err = os.MkdirAll(filepath.Dir(fullname), 0755)
	if err != nil {
		return err
	}

	writer, err := os.OpenFile(fullname, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, perms)
	if err != nil {
		return err
	}
	defer writer.Close()

	_, err = io.CopyN(writer, reader, size)
	if err != nil {
		return err
	}

	mtime := f.FileInfo().ModTime()
	err = os.Chtimes(fullname, mtime, mtime)
	if err != nil {
		return err
	}

	return nil
}

func readString(f *zip.File) (string, error) {

	reader, err := f.Open()
	if err != nil {
		return "", err
	}
	defer reader.Close()

	data, err := ioutil.ReadAll(reader)
	if err != nil {
		return "", err
	}

	return string(data), nil
}
