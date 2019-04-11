ARG=$1
PARAM=$2

token=$AO_TOKEN_STG
if [ "$ARG" = "prod" ]; then
    if [ -z "$AO_TOKEN_PROD" ]; then
        echo "AO_TOKEN_PROD must be defined for the \"prod\" argument"
        return
    fi
    token=$AO_TOKEN_PROD
elif [ -z "$AO_TOKEN_STG" ]; then
    echo "AO_TOKEN_STG must be defined for any argument other than \"prod\""
    return
fi

if [[ -z "$APPOPTICS_LOG_SETTINGS" ]]; then
    export APPOPTICS_LOG_SETTINGS=error,warn,patching,debug
fi

# define this for all options
export APPOPTICS_SERVICE_KEY=${token}:${AO_SERVICE_NAME:-node-todo-test}
echo Defined service as $APPOPTICS_SERVICE_KEY

if [[ -z "$ARG" ]]; then
    echo "source this script with an argument of stg or prod. it"
    echo "will define environment variables to enable testing with"
    echo "the specified collector".
    echo
    echo "you may also use the argument debug to define additional"
    echo "debugging variables"
    echo
elif [[ "$ARG" = "java" ]]; then
    echo "setting environment variables for standard java-collector"
    if [[ -z "$PARAM" ]]; then
        export APPOPTICS_REPORTER=ssl
        export APPOPTICS_COLLECTOR=localhost:12222
        export APPOPTICS_TRUSTEDPATH=./test/certs/java-collector.crt
        unset TODO_TRUSTEDPATH
    elif [[ "$PARAM" = "docker" ]]; then
        # set up environment for docker-compose build to point
        # appoptics at java-collector in containers
        export TODO_COLLECTOR=java-collector:12222
        export TODO_TRUSTEDPATH=/todo/certs/java-collector.crt
        export APPOPTICS_TRUSTEDPATH=/home/bruce/solarwinds/oboe-test/benchmark/node/collectors/java-collector/test-collector.crt
    else
        echo Invalid parameter "$PARAM" for argument "java"
    fi
elif [[ "$ARG" = "scribe" ]]; then
    echo "setting environment variables for standard scribe-collector"
    if [[ -z "$PARAM" ]]; then
        export APPOPTICS_REPORTER=ssl
        export APPOPTICS_COLLECTOR=localhost:4444
        export APPOPTICS_TRUSTEDPATH=./test/certs/scribe-collector.crt
        unset TODO_TRUSTEDPATH
    elif [[ "$PARAM" = "docker" ]]; then
        # used by docker-compose
        export TODO_COLLECTOR=scribe-collector:4444
        export TODO_TRUSTEDPATH=/todo/certs/scribe-collector.crt
    else
        echo Invalid parameter "$PARAM" for argument "scribe"
    fi
elif [[ "$ARG" = "stg" ]]; then
    echo "setting stg environment variables"
    export APPOPTICS_REPORTER=ssl
    export APPOPTICS_COLLECTOR=collector-stg.appoptics.com
    unset APPOPTICS_TRUSTEDPATH
    unset TODO_TRUSTEDPATH
    unset TODO_COLLECTOR
elif [[ "$ARG" = "prod" ]]; then
    echo "setting prod environment variables"
    export APPOPTICS_REPORTER=ssl
    export APPOPTICS_COLLECTOR=collector.appoptics.com
    unset APPOPTICS_TRUSTEDPATH
    unset TODO_TRUSTEDPATH
    unset TODO_COLLECTOR
elif [[ "$ARG" = "bindings" ]]; then
    # use these to provide authentication and specify an alternate branch/tag
    # for the install-appoptics-bindings.js script.
    # N.B. if fetching from packagecloud setting the next two are a good
    # alternative as packagecloud's proxy doesn't have authorization issues
    # when they are installed in a project .npmrc file, not the user .npmrc
    # file.
    export AO_TEST_PACKAGE=librato/node-appoptics-bindings#per-request-v2
    # this requires that one's git access token is already defined.
    export AO_TEST_GITAUTH=${AO_TOKEN_GIT}

elif [[ "$ARG" = "truncate" ]]; then
    # no error checking here...
    log=$(docker inspect -f '{{.LogPath}}' ${PARAM} 2> /dev/null)
    sudo truncate -s 0 $log

elif [[ "$ARG" = "debug" ]]; then
    # docker debugging helpers
    # (truncate log)
    # log=$(docker inspect -f '{{.LogPath}}' ${container-name} 2> /dev/null)
    # sudo truncate -s 0 $log
    # (view environment for container)
    # docker inspect -f '{{ json .Config.Env}}' todo-web-aaa
    # watching memory
    # watch -n60 'docker stats --no-stream --format "{{.Name}}: {{.MemUsage}}" todo_web-aaa_1  >> todo_web-aaa_1.memory.log'
    # examine another proc's env - cat /proc/17330/environ | tr \\0 \\n
    # or xargs --null --max-args=1 echo < /proc/PID/environ
    echo "setting debug environment variables to standard"
    export APPOPTICS_LOG_SETTINGS=error,warn,debug,patching,bind
    #export APPOPTICS_DEBUG_LEVEL=6
    #export APPOPTICS_SHOW_GYP=1

    # show output of the spawned 'npm install' process
    #export AO_TEST_BINDINGS_OUTPUT=1
    # see dist/debug-loggers.js for DEBUG options
    #export DEBUG
elif [[ "$ARG" = "help" ]]; then
    echo "help is not really implemented. read the code."
    echo "But to test try: '$ node server.js' and (optionally) '$ node tiny-server.js'"
    echo "Each has defaults and command line options documented in the code."
    echo
    echo "multiload.js can be used to create a load on the server"
else
    echo "ERROR $ARG invalid"
fi

return
