#!/bin/bash
# Init and prepare project folder, including any dependencies.

# the directory of the script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# the temp directory used, within $DIR
# omit the -p parameter to create a temporal directory in the default location
WORK_DIR=`mktemp -d -p "$DIR"`

# check if tmp dir was created
if [[ ! "$WORK_DIR" || ! -d "$WORK_DIR" ]]; then
    echo "Could not create temp dir"
    exit 1
fi

# deletes the temp directory
function cleanup {
    rm -rf "$WORK_DIR"
    echo "Deleted temp working directory $WORK_DIR"
}

# register the cleanup function to be called on the EXIT signal
trap cleanup EXIT

# implementation of script starts here

# Install python envrionment
python_home=$(pwd)/python2
if [ ! -d "${python_home}" ]; then
    mkdir -p ${python_home}
    pushd $WORK_DIR
    curl -L -o Python-2.7.18.tgz https://www.python.org/ftp/python/2.7.18/Python-2.7.18.tgz
    tar -zxvf Python-2.7.18.tgz
    pushd Python-2.7.18
    ./configure --prefix=$python_home
    make
    make install
    popd
    popd
fi

# Install nodejs envrionment
if [ ! -d "node_modules" ] && [ -f package-lock.json ]; then
    npm install
fi
