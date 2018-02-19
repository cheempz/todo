ARG=$1

if [[ -z "$AO_TOKEN_STG" ]]; then
    echo "AO_TOKEN_STG must be defined and contain a valid token"
    echo "for accessing collector-stg.appoptics.com"
    return
fi

# define this for all options
export APPOPTICS_SERVICE_KEY=${AO_TOKEN_STG}:node-todo-test

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
    echo "N.B. presumes ../oboe-test/collectors/java-collector/test-collector.crt"
    export APPOPTICS_REPORTER=ssl
    export APPOPTICS_COLLECTOR=localhost:12222
    export APPOPTICS_TRUSTEDPATH=../oboe-test/collectors/java-collector/test-collector.crt
elif [[ "$ARG" = "scribe" ]]; then
    echo "setting environment variables for standard scribe-collector"
    echo "N.B. presumes ../oboe-test/collectors/scribe-collector/test-collector.crt"
    echo "WARNING - scribe has cert problems, not functional"
    export APPOPTICS_REPORTER=ssl
    export APPOPTICS_COLLECTOR=localhost:4444
    export APPOPTICS_TRUSTEDPATH=../oboe-test/collectors/scribe-collector/ca.crt
elif [[ "$ARG" = "stg" ]]; then
    echo "setting stg environment variables"
    export APPOPTICS_REPORTER=ssl
    export APPOPTICS_COLLECTOR=collector-stg.appoptics.com
    unset APPOPTICS_TRUSTEDPATH
elif [[ "$ARG" = "prod" ]]; then
    echo "ERROR: prod is not yet implemented"
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

elif [[ "$ARG" = "debug" ]]; then
    # log=$(docker inspect -f '{{.LogPath}}' ${container-name} 2> /dev/null)
    # truncate -s 0 $log
    echo "setting debug environment variables to standard"
    export DEBUG=appoptics:error,appoptics:info,appoptics:debug
    #export APPOPTICS_DEBUG_LEVEL=6
    #export APPOPTICS_SHOW_GYP=1

    # show output of the spawned 'npm install' process
    #export AO_TEST_BINDINGS_OUTPUT=1
    # see dist/debug-loggers.js for DEBUG options
    #export DEBUG
elif [[ "$ARG" = "help" ]]; then
    echo "help is not implemented. read the code."
    echo "But to test try: '$ node server.js' and (optionally) '$ node tiny-server.js'"
    echo "Each has defaults and command line options documented in the code."
    echo
    echo "multitest.js creates a load on the server though it's not very evenly"
    echo "distributed at this point."
else
    echo "ERROR $ARG invalid"
fi

return
